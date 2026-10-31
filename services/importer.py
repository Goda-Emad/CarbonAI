"""CSV / Excel import. Preview first (no DB writes), then merge accepted rows. Nothing is replaced.

Backward compatible with the original 5-6 column template (النشاط، النطاق، الكمية، الوحدة، معامل الانبعاث[، المصدر]).
Rules: no invented dates (optional explicit default_date), no zero factor for a missing one, bad rows are
listed with a reason (never silently dropped), duplicates are reported not deleted.
"""
from __future__ import annotations

import io
import json
from dataclasses import dataclass, field

import pandas as pd

from db.connection import now_iso, transaction
from services import factor_library as FL
from services import ledger as L
from services import unit_conversion as uc

ALIASES = {
    "activity": ["النشاط", "activity", "activity_name"],
    "scope": ["النطاق", "scope"],
    "quantity": ["الكمية", "quantity", "qty"],
    "unit": ["الوحدة", "unit"],
    "factor": ["معامل الانبعاث", "emission_factor", "factor"],
    "source": ["المصدر", "source", "reference"],
    "date": ["التاريخ", "تاريخ النشاط", "date", "activity_date"],
    "country": ["الدولة", "country", "country_code"],
    "company": ["الشركة", "company"],
    "facility": ["الفرع", "facility", "branch"],
    "description": ["وصف النشاط", "description"],
    "fuel": ["نوع الوقود", "نوع الوقود أو الطاقة", "fuel", "fuel_or_material"],
    "category": ["فئة النشاط", "category", "category_key"],
    "subcategory": ["الفئة الفرعية", "subcategory"],
    "scope2_method": ["طريقة النطاق الثاني", "scope2_method"],
    "control": ["السيطرة", "ownership_control"],
    "energy_purchased": ["طاقة مشتراة", "energy_purchased"],
    "relation": ["علاقة سلسلة القيمة", "value_chain_relation"],
}
REQUIRED = ["activity", "quantity", "unit"]
VALID_SCOPES = {"scope 1": "Scope 1", "scope 2": "Scope 2", "scope 3": "Scope 3",
                "1": "Scope 1", "2": "Scope 2", "3": "Scope 3"}
TEMPLATE_COLUMNS = ["النشاط", "النطاق", "الكمية", "الوحدة", "معامل الانبعاث", "المصدر", "التاريخ", "الدولة",
                    "الشركة", "الفرع", "وصف النشاط", "نوع الوقود", "فئة النشاط", "السيطرة", "طاقة مشتراة",
                    "علاقة سلسلة القيمة"]


def read_upload(name: str, data: bytes) -> pd.DataFrame:
    if name.lower().endswith(".csv"):
        for enc in ("utf-8-sig", "cp1256"):
            try:
                df = pd.read_csv(io.BytesIO(data), encoding=enc, dtype=str, keep_default_na=False)
                break
            except UnicodeDecodeError:
                continue
        else:
            raise ValueError("Cannot decode CSV (tried UTF-8 and Windows-1256)")
    else:
        df = pd.read_excel(io.BytesIO(data), dtype=str).fillna("")
    df.columns = [str(c).strip() for c in df.columns]
    return df


def map_columns(df: pd.DataFrame) -> dict:
    lower = {c.lower(): c for c in df.columns}
    m = {}
    for key, names in ALIASES.items():
        for n in names:
            if n in df.columns:
                m[key] = n; break
            if n.lower() in lower:
                m[key] = lower[n.lower()]; break
    return m


@dataclass
class Preview:
    accepted: list = field(default_factory=list)    # dicts ready for commit
    rejected: list = field(default_factory=list)    # (row_number, reason, raw dict)
    warnings: list = field(default_factory=list)    # (row_number, text)
    missing_columns: list = field(default_factory=list)


def _cell(row, colmap, key):
    c = colmap.get(key)
    return "" if c is None else str(row.get(c, "")).strip()


def preview(df: pd.DataFrame, *, default_date=None, default_country=None) -> Preview:
    cm, pv = map_columns(df), Preview()
    pv.missing_columns = [k for k in REQUIRED if k not in cm]
    if pv.missing_columns:
        return pv
    dd = L.parse_date(default_date) if default_date else None
    for i, row in df.iterrows():
        n = i + 2  # spreadsheet row number (header = 1)
        raw = {c: str(row[c]) for c in df.columns}
        act, unit = _cell(row, cm, "activity"), _cell(row, cm, "unit")
        if not act or act.lower() == "nan":
            pv.rejected.append((n, "اسم النشاط فارغ / empty activity", raw)); continue
        try:
            qty = float(_cell(row, cm, "quantity").replace(",", ""))
        except ValueError:
            pv.rejected.append((n, "الكمية ليست رقمًا / quantity is not a number", raw)); continue
        if qty <= 0:
            pv.rejected.append((n, "الكمية يجب أن تكون أكبر من صفر / quantity must be > 0", raw)); continue
        try:
            uc.canon(unit)
        except uc.UnitError:
            pv.rejected.append((n, f"وحدة غير معروفة / unknown unit {unit!r}", raw)); continue
        try:
            d = L.parse_date(_cell(row, cm, "date"))
        except ValueError as e:
            pv.rejected.append((n, f"تاريخ غير صالح / {e}", raw)); continue
        if d is None and dd is not None:
            d = dd; pv.warnings.append((n, "تاريخ افتراضي صريح مطبّق / explicit default date applied"))
        elif d is None:
            pv.warnings.append((n, "بلا تاريخ: يُحفظ دون شهر/سنة / no date: stored undated"))
        scope_raw = _cell(row, cm, "scope")
        scope = VALID_SCOPES.get(scope_raw.lower()) if scope_raw else None
        if scope_raw and scope is None:
            pv.rejected.append((n, f"نطاق غير صالح / invalid scope {scope_raw!r}", raw)); continue
        fval = _cell(row, cm, "factor")
        if fval:
            try:
                if float(fval.replace(",", "")) < 0:
                    raise ValueError
            except ValueError:
                pv.rejected.append((n, f"معامل غير صالح / invalid factor {fval!r}", raw)); continue
        country = (_cell(row, cm, "country") or default_country or "").upper() or None
        pv.accepted.append(dict(row_number=n, activity=act, quantity=str(qty), unit=unit, date=d, scope=scope,
                                factor=fval.replace(",", "") if fval else None, source=_cell(row, cm, "source"),
                                country=country, company=_cell(row, cm, "company"), facility=_cell(row, cm, "facility"),
                                description=_cell(row, cm, "description"), fuel=_cell(row, cm, "fuel") or None,
                                category=_cell(row, cm, "category") or None,
                                scope2_method=_cell(row, cm, "scope2_method") or None,
                                control=_cell(row, cm, "control") or "unknown",
                                energy_purchased=_cell(row, cm, "energy_purchased") or "unknown",
                                relation=_cell(row, cm, "relation") or "unknown"))
    return pv


def commit(con, pv: Preview, *, file_name: str, keep_duplicates: bool = False, user: str | None = None) -> dict:
    """Merge accepted rows. Per-row failures never abort other rows; batch + rejections are logged."""
    with transaction(con):
        batch_id = con.execute("INSERT INTO import_batches(file_name,imported_at,rows_total,rows_accepted,rows_rejected,"
                               "rows_duplicate,rows_needs_review,notes) VALUES (?,?,?,0,?,0,0,NULL)",
                               (file_name, now_iso(), len(pv.accepted) + len(pv.rejected), len(pv.rejected))).lastrowid
        for n, why, raw in pv.rejected:
            con.execute("INSERT INTO import_rejections(batch_id,row_number,reason,raw_json) VALUES (?,?,?,?)",
                        (batch_id, n, why, json.dumps(raw, ensure_ascii=False)))
    added = dup = review = failed = 0
    duplicates, failures = [], []
    for a in pv.accepted:
        try:
            cid = fid = None
            if a["company"]:
                cid = L.upsert_company(con, a["company"], a["country"])
                if a["facility"]:
                    fid = L.add_facility(con, cid, a["facility"], a["country"])
            factor, reason = None, ""
            year = a["date"].year if a["date"] else None
            if a["factor"] is not None:
                factor = L.user_factor(a["factor"], country=a["country"] or "", category=a["category"] or "legacy",
                                       activity=a["activity"], unit=a["unit"], year=year or 0,
                                       source=a["source"] or f"imported file: {file_name}")
                reason = "Factor supplied in the file (user-supplied, unverified)"
            elif a["category"] and a["country"] and year:
                sug = FL.suggest(con, country=a["country"], category=a["category"], year=year, unit=a["unit"],
                                 fuel=a["fuel"])
                if sug.chosen:
                    factor, reason = sug.chosen.factor, sug.chosen.reason
                else:
                    reason = sug.message
            res = L.add_record(con, activity_name=a["activity"], quantity=a["quantity"], unit=a["unit"],
                               country_code=a["country"], activity_date=a["date"], description=a["description"],
                               company_id=cid, facility_id=fid, fuel_or_material=a["fuel"], category_key=a["category"],
                               factor=factor, factor_selection_reason=reason, given_scope=a["scope"],
                               scope2_method=a["scope2_method"], ownership_control=a["control"],
                               energy_purchased=a["energy_purchased"], value_chain_relation=a["relation"],
                               origin=f"import:{file_name}", batch_id=batch_id, allow_duplicate=keep_duplicates,
                               user=user)
            if res["duplicate"]:
                dup += 1; duplicates.append((a["row_number"], a["activity"]))
            else:
                added += 1
                if res["status"] != "calculated":
                    review += 1
        except Exception as exc:  # row-level isolation
            failed += 1; failures.append((a["row_number"], str(exc)))
    with transaction(con):
        con.execute("UPDATE import_batches SET rows_accepted=?, rows_duplicate=?, rows_needs_review=?, "
                    "rows_rejected=rows_rejected+?, notes=? WHERE batch_id=?",
                    (added, dup, review, failed, json.dumps({"failures": failures}), batch_id))
    return {"batch_id": batch_id, "added": added, "duplicates": duplicates, "needs_review": review,
            "rejected": len(pv.rejected), "failed": failures}
