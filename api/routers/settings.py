"""App settings + admin maintenance (backup / db info)."""
from __future__ import annotations

import sqlite3

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from api.deps import Auth, get_con, require
from api.util import rows_list
from db.connection import backup_file, db_path, transaction

router = APIRouter(prefix="/api/settings", tags=["settings"])

EDITABLE_KEYS = {"default_country", "scope2_method", "display_unit", "org_name_ar", "org_name_en"}
READABLE_KEYS = EDITABLE_KEYS | {"created_at"}


class SettingIn(BaseModel):
    key: str
    value: str


@router.get("")
def get_settings(con: sqlite3.Connection = Depends(get_con), user: Auth = Depends(require("admin", "head_office", "factory_manager", "viewer"))):
    rows = con.execute("SELECT key, value FROM settings").fetchall()
    return {r["key"]: r["value"] for r in rows if r["key"] in READABLE_KEYS}


@router.put("")
def put_setting(body: SettingIn, con: sqlite3.Connection = Depends(get_con),
                user: Auth = Depends(require("admin"))):
    if body.key not in EDITABLE_KEYS:
        raise HTTPException(400, f"key must be one of: {', '.join(sorted(EDITABLE_KEYS))}")
    with transaction(con):
        con.execute("INSERT INTO settings(key,value) VALUES (?,?) "
                    "ON CONFLICT(key) DO UPDATE SET value=excluded.value", (body.key, body.value))
    return {"ok": True}


@router.post("/backup")
def backup(con: sqlite3.Connection = Depends(get_con), user: Auth = Depends(require("admin"))):
    dest = backup_file(db_path(), label="api_backup")
    return {"ok": dest is not None, "path": str(dest) if dest else None}


@router.get("/db-info")
def db_info(con: sqlite3.Connection = Depends(get_con), user: Auth = Depends(require("admin", "head_office"))):
    counts = {}
    for t in ("activity_records", "companies", "facilities", "emission_factors", "users",
              "report_submissions", "import_batches"):
        counts[t] = con.execute(f"SELECT COUNT(*) c FROM {t}").fetchone()["c"]
    return {"path": str(db_path()), "counts": counts}
