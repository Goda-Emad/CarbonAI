"""Report downloads: CSV + PDF, same filters and same summarize() as the dashboard."""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import Response

from api.deps import Auth, current_user, get_con, resolve_scope
from services import ledger as L
from services import reports as R

router = APIRouter(prefix="/api/reports", tags=["reports"])


def _dataset(con, user: Auth, company_id, facility_id, year, month, date_from, date_to, scope):
    cid, fid = resolve_scope(user, company_id, facility_id)
    df = L.fetch_records(con, company_id=cid, facility_id=fid, year=year, month=month,
                         date_from=date_from or None, date_to=date_to or None, scope=scope)
    return df, cid, fid


def _labels(con, cid, fid):
    company = facility = ""
    if fid:
        r = con.execute("SELECT f.name fn, c.name cn FROM facilities f JOIN companies c "
                        "ON c.company_id=f.company_id WHERE f.facility_id=?", (fid,)).fetchone()
        if r:
            company, facility = r["cn"], r["fn"]
    elif cid:
        r = con.execute("SELECT name FROM companies WHERE company_id=?", (cid,)).fetchone()
        if r:
            company = r["name"]
    return company, facility


@router.get("/csv")
def csv_report(company_id: int | None = None, facility_id: int | None = None, year: int | None = None,
               month: int | None = None, date_from: str | None = None, date_to: str | None = None,
               scope: str | None = None, con=Depends(get_con), user: Auth = Depends(current_user)):
    df, cid, fid = _dataset(con, user, company_id, facility_id, year, month, date_from, date_to, scope)
    data = R.csv_bytes(df)
    name = R.csv_filename("records", year=year, month=month, date_from=date_from, date_to=date_to)
    return Response(content=data, media_type="text/csv; charset=utf-8",
                    headers={"Content-Disposition": f'attachment; filename="{name}"'})


@router.get("/monthly-csv")
def monthly_csv(company_id: int | None = None, facility_id: int | None = None, year: int | None = None,
                month: int | None = None, date_from: str | None = None, date_to: str | None = None,
                scope: str | None = None, con=Depends(get_con), user: Auth = Depends(current_user)):
    df, cid, fid = _dataset(con, user, company_id, facility_id, year, month, date_from, date_to, scope)
    data = R.monthly_summary_df(df).to_csv(index=False).encode("utf-8-sig")
    name = R.csv_filename("monthly_summary", year=year, month=month, date_from=date_from, date_to=date_to)
    return Response(content=data, media_type="text/csv; charset=utf-8",
                    headers={"Content-Disposition": f'attachment; filename="{name}"'})


@router.get("/pdf")
def pdf_report(company_id: int | None = None, facility_id: int | None = None, year: int | None = None,
               month: int | None = None, date_from: str | None = None, date_to: str | None = None,
               scope: str | None = None, lang: str = "en", con=Depends(get_con),
               user: Auth = Depends(current_user)):
    df, cid, fid = _dataset(con, user, company_id, facility_id, year, month, date_from, date_to, scope)
    company, facility = _labels(con, cid, fid)
    period = R.period_label(year, month, date_from, date_to)
    try:
        data = R.pdf_bytes(df, title_company=company, title_facility=facility,
                           country="", period=period, lang=lang)
    except R.PdfUnavailable as e:
        raise HTTPException(409, f"PDF not available: {e}")
    name = f"carbonai_report_{period}_{'ar' if lang == 'ar' else 'en'}.pdf"
    return Response(content=data, media_type="application/pdf",
                    headers={"Content-Disposition": f'attachment; filename="{name}"'})
