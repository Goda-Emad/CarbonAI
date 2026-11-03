"""v4 tests: NZ removal execution, Egypt selection/fallback, refrigerant module (single gas,
blends, recovery, explicit leakage), scope separation, reference library, isolation, PDFs."""
from __future__ import annotations

import os
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

from fastapi.testclient import TestClient

from api.main import app
from db.connection import connect
from db.schema import init_db
from db.seed import seed_all

ADMIN_PW = "AdminPass1!"
ROOT = Path(__file__).resolve().parents[2]


class Base(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        os.environ["CARBONAI_DB_PATH"] = str(Path(self.tmp.name) / "t.db")
        os.environ["CARBONAI_ADMIN_PASSWORD"] = ADMIN_PW
        from api import security
        security.reset_secret_cache()
        self.client = TestClient(app)
        self.client.__enter__()
        self.admin = {"Authorization": f"Bearer {self._login('admin', ADMIN_PW)}"}
        self.fac = self.client.post("/api/org/facilities", headers=self.admin,
                                    json={"name": "Factory A", "country_code": "EG"}).json()
        self.fac_b = self.client.post("/api/org/facilities", headers=self.admin,
                                      json={"name": "Factory B", "country_code": "EG"}).json()

    def tearDown(self):
        self.client.__exit__(None, None, None)
        self.tmp.cleanup()

    def _login(self, username: str, password: str) -> str:
        r = self.client.post("/api/auth/login", json={"username": username, "password": password})
        self.assertEqual(r.status_code, 200, r.text)
        return r.json()["token"]

    def _user(self, username: str, facility_id: int, role: str = "factory_manager") -> dict:
        r = self.client.post("/api/users", headers=self.admin, json={
            "username": username, "password": "UserPass1!", "role": role, "facility_id": facility_id})
        self.assertEqual(r.status_code, 201, r.text)
        return {"Authorization": f"Bearer {self._login(username, 'UserPass1!')}"}

    def _equipment(self, headers=None, facility_id=None, key="R410A", ident="CH-01") -> dict:
        r = self.client.post("/api/cooling/equipment", headers=headers or self.admin, json={
            "facility_id": facility_id or self.fac["facility_id"], "identifier": ident,
            "equipment_type": "chiller", "refrigerant_key": key, "charge_kg": "120"})
        self.assertEqual(r.status_code, 201, r.text)
        return r.json()


class NZRemoval(unittest.TestCase):
    def test_removal_cli_executes_and_preserves_history(self):
        with tempfile.TemporaryDirectory() as td:
            db = str(Path(td) / "legacy.db")
            os.environ["CARBONAI_DB_PATH"] = db
            con = connect()
            init_db(con)
            seed_all(con, include_legacy_nz=True)
            con.commit()
            nz = con.execute("SELECT COUNT(*) c FROM emission_factors WHERE country_code='NZ'").fetchone()["c"]
            self.assertEqual(nz, 37)
            # a historical record that must survive removal
            from services import ledger as L
            f = L.user_factor("2.68", country="NZ", category="stationary_fuel", activity="diesel",
                              unit="litre", year=2023, source="historical fixture")
            L.add_record(con, activity_name="historical diesel", quantity="100", unit="litre",
                         country_code="NZ", activity_date="2023-05-01",
                         category_key="stationary_fuel", factor=f)
            before = con.execute("SELECT COUNT(*) c, SUM(CAST(kg_co2e AS REAL)) s FROM activity_records").fetchone()
            con.close()

            env = {**os.environ, "CARBONAI_DB_PATH": db}
            res = subprocess.run([sys.executable, "scripts/nz_removal_dry_run.py",
                                  "--execute", "--confirm", "REMOVE-LEGACY-NZ"],
                                 cwd=str(ROOT), env=env, capture_output=True, text=True, timeout=120)
            self.assertEqual(res.returncode, 0, res.stdout + res.stderr)

            con = connect()
            nz_after = con.execute("SELECT COUNT(*) c FROM emission_factors WHERE country_code='NZ'").fetchone()["c"]
            src_after = con.execute("SELECT COUNT(*) c FROM sources WHERE reference_id='NZ-MFE-2023-ME1764'").fetchone()["c"]
            after = con.execute("SELECT COUNT(*) c, SUM(CAST(kg_co2e AS REAL)) s FROM activity_records").fetchone()
            log = con.execute("SELECT outcome FROM update_log WHERE source='nz_removal'").fetchone()
            snap = con.execute("SELECT factor_snapshot_json, kg_co2e FROM activity_records "
                               "WHERE activity_name='historical diesel'").fetchone()
            con.close()
            self.assertEqual(nz_after, 0)
            self.assertEqual(src_after, 0)
            self.assertEqual(before["c"], after["c"], "historical records must not be touched")
            self.assertEqual(before["s"], after["s"])
            self.assertIsNotNone(log)
            self.assertIn('"country": "NZ"', snap["factor_snapshot_json"] or "")
            self.assertEqual(float(snap["kg_co2e"]), 268.0)


class EgyptSelection(Base):
    def test_default_country_is_egypt_and_no_nz_selectable(self):
        self.assertEqual(self.client.get("/api/settings", headers=self.admin).json()["default_country"], "EG")
        rows = self.client.get("/api/factors", headers=self.admin, params={"country": "NZ"}).json()
        self.assertEqual(rows, [])

    def test_egypt_official_factor_selection(self):
        r = self.client.post("/api/records", headers=self.admin, json={
            "activity_name": "EEHC thermal intensity", "quantity": "100000", "unit": "kWh",
            "activity_date": "2024-06-01", "category_key": "electricity", "country_code": "EG",
            "facility_id": self.fac["facility_id"],
            "ownership_control": "owned_controlled", "energy_purchased": "no",
            "factor": {"factor_id": "EG-EEHC-THERMAL-INTENSITY-FY2023-24"}})
        self.assertEqual(r.status_code, 201, r.text)
        rec = r.json()["record"]
        self.assertEqual(rec["calc_status"], "calculated")
        self.assertEqual(float(rec["kg_co2e"]), 100000 * 0.3803)
        self.assertIn("EEHC", rec["factor_source"])
        self.assertEqual(rec["factor_verification"], "unverified")

    def test_international_fallback_requires_explicit_proxy(self):
        body = {"activity_name": "R410 leakage fallback", "quantity": "1", "unit": "kg",
                "activity_date": "2024-06-01", "category_key": "refrigerant", "country_code": "EG",
                "facility_id": self.fac["facility_id"],
                "factor": {"factor_id": "REF-R410A-AR5"}}
        r1 = self.client.post("/api/records", headers=self.admin, json=body)
        self.assertEqual(r1.status_code, 400)
        body["factor"] = {"factor_id": "REF-R410A-AR5", "proxy_confirmed": True,
                          "proxy_rationale": "IPCC GWP default; no Egyptian GWP table"}
        r2 = self.client.post("/api/records", headers=self.admin, json=body)
        self.assertEqual(r2.status_code, 201, r2.text)
        self.assertTrue(r2.json()["record"]["calc_status"] == "calculated")

    def test_source_traceability_everywhere(self):
        rows = self.client.get("/api/factors/egypt", headers=self.admin).json()
        for r in rows:
            self.assertTrue(r["source_organization"], r["factor_id"])
            self.assertTrue(r["source_document"], r["factor_id"])
            self.assertTrue(r["source_locator"] or r["source_page"], r["factor_id"])


class RefrigerantCalculations(Base):
    def test_single_gas_calculation(self):
        eq = self._equipment()
        r = self.client.post("/api/cooling/records", headers=self.admin, json={
            "equipment_id": eq["equipment_id"], "service_date": "2026-02-01",
            "gwp_basis": "AR5", "added_kg": "10"})
        self.assertEqual(r.status_code, 201, r.text)
        self.assertEqual(float(r.json()["kg_co2e"]), 10 * 1924)
        self.assertEqual(r.json()["leaked_kg"], "10")

    def test_blend_calculation_weighted(self):
        # R-407C AR5: published 1624 (components 23/25/52 -> weighted match)
        eq = self._equipment(key="R407C", ident="CH-407C")
        r = self.client.post("/api/cooling/records", headers=self.admin, json={
            "equipment_id": eq["equipment_id"], "service_date": "2026-02-02",
            "gwp_basis": "AR5", "leaked_kg": "1"})
        self.assertEqual(r.status_code, 201, r.text)
        self.assertEqual(float(r.json()["kg_co2e"]), 1624)
        rows = self.client.get("/api/refrigerants", headers=self.admin).json()
        r407c = next(x for x in rows if x["designation"] == "R-407C")
        self.assertTrue(r407c["components"], "blend composition must be recorded")

    def test_recovery_is_not_emitted(self):
        eq = self._equipment()
        r = self.client.post("/api/cooling/records", headers=self.admin, json={
            "equipment_id": eq["equipment_id"], "service_date": "2026-02-03",
            "gwp_basis": "AR5", "added_kg": "10", "recovered_kg": "4"})
        self.assertEqual(r.status_code, 201, r.text)
        self.assertEqual(r.json()["leaked_kg"], "6")
        self.assertEqual(float(r.json()["kg_co2e"]), 6 * 1924)
        # recovering more than added => zero-leak event, still recorded
        r2 = self.client.post("/api/cooling/records", headers=self.admin, json={
            "equipment_id": eq["equipment_id"], "service_date": "2026-02-04",
            "gwp_basis": "AR5", "added_kg": "2", "recovered_kg": "5"})
        self.assertEqual(r2.status_code, 201, r2.text)
        self.assertEqual(r2.json()["leaked_kg"], "0")
        self.assertEqual(float(r2.json()["kg_co2e"]), 0.0)

    def test_explicit_leakage_overrides_and_no_default_rate(self):
        eq = self._equipment()
        r = self.client.post("/api/cooling/records", headers=self.admin, json={
            "equipment_id": eq["equipment_id"], "service_date": "2026-02-05",
            "gwp_basis": "AR5", "leaked_kg": "2.5", "added_kg": "10"})
        self.assertEqual(r.status_code, 201, r.text)
        self.assertEqual(float(r.json()["kg_co2e"]), 2.5 * 1924)
        # no quantities at all -> explicit error (never assume the charge leaked)
        r2 = self.client.post("/api/cooling/records", headers=self.admin, json={
            "equipment_id": eq["equipment_id"], "service_date": "2026-02-06", "gwp_basis": "AR5"})
        self.assertEqual(r2.status_code, 400)

    def test_scope_separation_and_kpi(self):
        eq = self._equipment()
        self.client.post("/api/cooling/records", headers=self.admin, json={
            "equipment_id": eq["equipment_id"], "service_date": "2026-02-10",
            "gwp_basis": "AR5", "leaked_kg": "5", "ownership_control": "owned_controlled"})
        # electricity is a separate Scope 2 record, never merged into refrigerant
        self.client.post("/api/records", headers=self.admin, json={
            "activity_name": "electricity for chillers", "quantity": "10000", "unit": "kWh",
            "activity_date": "2026-02-10", "category_key": "electricity", "country_code": "EG",
            "facility_id": self.fac["facility_id"], "ownership_control": "owned_controlled",
            "energy_purchased": "yes",
            "manual_factor": {"value": "0.45", "source": "utility bill"}})
        rows = self.client.get("/api/records", headers=self.admin,
                               params={"category_key": "refrigerant"}).json()["rows"]
        self.assertEqual({r["scope"] for r in rows}, {"Scope 1"})
        s = self.client.get("/api/dashboard/summary", headers=self.admin).json()
        self.assertEqual(float(s["by_scope_kg"]["Scope 1"]), 5 * 1924)
        self.assertEqual(float(s["by_scope_kg"]["Scope 2"]), 10000 * 0.45)
        self.assertEqual(float(s["refrigerant"]["kg"]), 5 * 1924)
        self.assertAlmostEqual(s["refrigerant"]["share_of_scope1_pct"], 100.0, places=1)

    def test_factory_isolation(self):
        eq = self._equipment()
        hb = self._user("mgr_b", self.fac_b["facility_id"])
        r = self.client.post("/api/cooling/records", headers=hb, json={
            "equipment_id": eq["equipment_id"], "service_date": "2026-02-11",
            "gwp_basis": "AR5", "leaked_kg": "1"})
        self.assertEqual(r.status_code, 403)
        r2 = self.client.post("/api/cooling/equipment", headers=hb, json={
            "facility_id": self.fac["facility_id"], "identifier": "X", "equipment_type": "chiller",
            "refrigerant_key": "R410A"})
        self.assertEqual(r2.status_code, 403)
        self.assertEqual(self.client.get("/api/cooling/records", headers=hb).json(), [])

    def test_unsupported_basis_is_rejected(self):
        eq = self._equipment()
        r = self.client.post("/api/cooling/records", headers=self.admin, json={
            "equipment_id": eq["equipment_id"], "service_date": "2026-02-12",
            "gwp_basis": "AR9", "leaked_kg": "1"})
        self.assertEqual(r.status_code, 400)


class ReferenceLibrary(Base):
    def test_catalogue_complete_and_honest(self):
        rows = self.client.get("/api/references", headers=self.admin).json()
        self.assertGreaterEqual(len(rows), 30)
        self.assertGreaterEqual(sum(1 for r in rows if r["country_applicability"] == "EG"), 10)
        for r in rows:
            self.assertTrue(r["title"])
            self.assertTrue(r["organization"])
            self.assertIn(r["kind"], ("standard", "methodology", "factor_database", "gwp",
                                      "national_inventory"))
            if r["url"]:
                self.assertTrue(r["url"].startswith("https://"), r["ref_key"])
        keys = [r["ref_key"] for r in rows]
        self.assertEqual(len(keys), len(set(keys)))
        # ISO entries exist but are flagged as standards, not factor databases
        iso = [r for r in rows if r["ref_key"].startswith("ISO-")]
        self.assertGreaterEqual(len(iso), 4)
        self.assertTrue(all(r["kind"] == "standard" for r in iso))

    def test_groups_endpoint(self):
        g = self.client.get("/api/references/groups", headers=self.admin).json()
        self.assertIn("standard", g["groups"])
        self.assertGreater(g["counts"]["gwp"], 0)

    def test_reports_include_refrigerant(self):
        eq = self._equipment()
        self.client.post("/api/cooling/records", headers=self.admin, json={
            "equipment_id": eq["equipment_id"], "service_date": "2026-01-15",
            "gwp_basis": "AR5", "leaked_kg": "3"})
        pdf = self.client.get("/api/reports/annual", headers=self.admin, params={"year": 2026})
        self.assertEqual(pdf.status_code, 200)
        self.assertTrue(pdf.content.startswith(b"%PDF"))


if __name__ == "__main__":
    unittest.main()
