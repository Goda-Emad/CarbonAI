"""CSV / Excel import endpoints: preview first (no writes), then explicit commit.
Factory-scoped users always have rows attributed to their own facility."""
from __future__ import annotations

import io

import pandas as pd
from fastapi import APIRouter, Depends, File, HTTPException, UploadFile

from api.deps import Auth, current_user, get_con, require
from services import importer as I

router = APIRouter(prefix="/api/imports", tags=["imports"])


def _read(name: str, data: bytes) -> pd.DataFrame:
    try:
        return I.read_upload(name, data)
    except ValueError as e:
        raise HTTPException(400, str(e))


def _preview_json(pv: I.Preview, *, override_facility: str | None = None) -> dict:
    return {
        "missing_columns": pv.missing_columns,
        "accepted": [{"row_number": a["row_number"], "activity": a["activity"], "quantity": a["quantity"],
                      "unit": a["unit"], "date": a["date"].isoformat() if a["date"] else None,
                      "scope": a["scope"], "factor": a["factor"], "source": a["source"],
                      "country": a["country"], "company": a["company"], "facility": a["facility"],
                      "category": a["category"], "fuel": a["fuel"]}
                     for a in pv.accepted],
        "rejected": [{"row_number": n, "reason": why} for n, why, _raw in pv.rejected],
        "warnings": [{"row_number": n, "text": t} for n, t in pv.warnings],
        "facility_override": override_facility,
    }


@router.post("/preview")
def preview_import(file: UploadFile = File(...), default_country: str | None = None,
                   default_date: str | None = None, con=Depends(get_con),
                   user: Auth = Depends(require("admin", "head_office", "factory_manager"))):
    data = file.file.read()
    if len(data) > 10 * 1024 * 1024:
        raise HTTPException(413, "file too large (max 10 MB)")
    df = _read(file.filename or "upload.csv", data)
    pv = I.preview(df, default_date=default_date, default_country=default_country)
    override = None
    if user.is_factory_scoped:
        override = _facility_name(con, user)
        for a in pv.accepted:  # tenancy: rows always belong to the caller's facility
            a["company"], a["facility"] = _user_company(con, user), override
    return _preview_json(pv, override_facility=override)


@router.post("/commit")
def commit_import(file: UploadFile = File(...), default_country: str | None = None,
                  default_date: str | None = None, keep_duplicates: bool = False,
                  con=Depends(get_con), user: Auth = Depends(require("admin", "head_office", "factory_manager"))):
    data = file.file.read()
    df = _read(file.filename or "upload.csv", data)
    pv = I.preview(df, default_date=default_date, default_country=default_country)
    if pv.missing_columns:
        raise HTTPException(400, f"missing required columns: {', '.join(pv.missing_columns)}")
    if user.is_factory_scoped:
        override = _facility_name(con, user)
        for a in pv.accepted:
            a["company"], a["facility"] = _user_company(con, user), override
    try:
        res = I.commit(con, pv, file_name=file.filename or "upload.csv",
                       keep_duplicates=keep_duplicates, user=user.username)
    except Exception as e:
        raise HTTPException(500, f"import failed: {e}")
    return res


@router.get("/batches")
def batches(con=Depends(get_con), user: Auth = Depends(require("admin", "head_office", "factory_manager"))):
    rows = con.execute("SELECT * FROM import_batches ORDER BY batch_id DESC LIMIT 100").fetchall()
    from api.util import rows_list
    return rows_list(rows)


@router.get("/template.csv")
def template(user: Auth = Depends(current_user)):
    csv = (",".join(I.TEMPLATE_COLUMNS) + "\n" + ",".join(
        ["diesel generator", "Scope 1", "1200", "litre", "2.68", "supplier invoice",
         "2024-03-15", "EG", "", "", "generators fuel", "diesel", "stationary_fuel",
         "owned_controlled", "no", "own_fleet"])).encode("utf-8-sig")
    from fastapi.responses import Response
    return Response(content=csv, media_type="text/csv; charset=utf-8",
                    headers={"Content-Disposition": 'attachment; filename="carbonai_import_template.csv"'})


def _facility_name(con, user: Auth) -> str:
    r = con.execute("SELECT name FROM facilities WHERE facility_id=?", (user.facility_id,)).fetchone()
    return r["name"] if r else ""


def _user_company(con, user: Auth) -> str:
    if user.company_id is None:
        return ""
    r = con.execute("SELECT name FROM companies WHERE company_id=?", (user.company_id,)).fetchone()
    return r["name"] if r else ""
