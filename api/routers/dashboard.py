"""Dashboard aggregation. One data path for every number: ledger.fetch_records + ledger.summarize
(same as the CSV/PDF reports), scoped to the caller's tenancy."""
from __future__ import annotations

from fastapi import APIRouter, Depends

from api.deps import Auth, get_con, current_user, resolve_scope
from services import ledger as L

router = APIRouter(prefix="/api/dashboard", tags=["dashboard"])


def _by_facility(df):
    out = []
    if df.empty:
        return out
    calc = df[df["calc_status"] == "calculated"]
    for name, g in calc.groupby(["facility_id", "facility_name"], dropna=False):
        sub = L.summarize(g)
        out.append({"facility_id": None if name[0] is None else int(name[0]),
                    "facility_name": name[1] or "—",
                    "total_kg_co2e": str(sub["total_kg"]),
                    "total_t_co2e": str(sub["total_t"]),
                    "records": int(len(g)),
                    "by_scope_kg": {k: str(v) for k, v in sub["by_scope_kg"].items()}})
    return sorted(out, key=lambda x: -float(x["total_kg_co2e"] or 0))


def _by_category(df):
    if df.empty:
        return []
    calc = df[df["calc_status"] == "calculated"]
    out = []
    for key, g in calc.groupby("category_key", dropna=False):
        out.append({"category_key": key or "other", "total_kg_co2e": str(L._sum(g["kg"]))})
    return sorted(out, key=lambda x: -float(x["total_kg_co2e"] or 0))


@router.get("/summary")
def summary(con=Depends(get_con), user: Auth = Depends(current_user),
            company_id: int | None = None, facility_id: int | None = None,
            year: int | None = None, month: int | None = None,
            date_from: str | None = None, date_to: str | None = None, scope: str | None = None,
            category_key: str | None = None):
    cid, fid = resolve_scope(user, company_id, facility_id)
    df = L.fetch_records(con, company_id=cid, facility_id=fid, year=year, month=month,
                         date_from=date_from or None, date_to=date_to or None, scope=scope,
                         category_key=category_key)
    s = L.summarize(df, year=year)
    return {
        "total_kg_co2e": str(s["total_kg"]), "total_t_co2e": str(s["total_t"]),
        "by_scope_kg": {k: str(v) for k, v in s["by_scope_kg"].items()},
        "unscoped_kg": str(s["unscoped_kg"]), "undated_kg": str(s["undated_kg"]),
        "monthly_kg": {f"{y}-{m:02d}": str(v) for (y, m), v in s["monthly_kg"].items()},
        "avg_monthly_active_kg": None if s["avg_monthly_active_kg"] is None else str(s["avg_monthly_active_kg"]),
        "avg_monthly_12_kg": None if s["avg_monthly_12_kg"] is None else str(s["avg_monthly_12_kg"]),
        "months_with_data": s["months_with_data"],
        "records": s["records"], "calculated": s["calculated"],
        "needs_review": s["needs_review"], "verified_pct": s["verified_pct"],
        "verified_factor_records": s["verified_factor_records"],
        "top_sources": [{"activity": a, "total_kg_co2e": str(v)} for a, v in L.top_sources(df)],
        "yearly_totals": {str(y): str(v) for y, v in L.yearly_totals(df).items()},
        "by_facility": _by_facility(df), "by_category": _by_category(df),
        "scope": {"company_id": cid, "facility_id": fid},
    }


@router.get("/comparison")
def comparison(year: int | None = None, con=Depends(get_con), user: Auth = Depends(current_user)):
    """Facility-vs-facility totals (head office / admin view)."""
    cid, _ = resolve_scope(user, None, None)
    df = L.fetch_records(con, company_id=cid, year=year)
    return {"year": year, "facilities": _by_facility(df), "by_category": _by_category(df)}
