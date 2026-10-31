"""Reduction plans (emission-reduction actions). Additive only; status transitions are audited
by the created_at/updated timeline on the row."""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from api.deps import Auth, current_user, get_con, require, resolve_scope
from api.util import rows_list
from db.connection import now_iso, transaction

router = APIRouter(prefix="/api/plans", tags=["plans"])

AREAS = ["رفع كفاءة الكهرباء", "تحسين كفاءة الوقود", "تحسين النقل والشحن",
         "تقليل المخلفات", "تحسين كفاءة المياه", "مراجعة المشتريات",
         "Electricity efficiency", "Fuel efficiency", "Transport & freight",
         "Waste reduction", "Water efficiency", "Procurement review"]
STATUSES = ("planned", "in_progress", "done", "cancelled")


class PlanIn(BaseModel):
    area: str
    description: str = ""
    owner: str = ""
    target_date: str | None = None
    status: str = "planned"
    linked_category_key: str | None = None
    assumptions: str = ""


@router.get("")
def list_plans(con=Depends(get_con), user: Auth = Depends(current_user)):
    rows = rows_list(con.execute("SELECT * FROM reduction_plans ORDER BY plan_id DESC").fetchall())
    return rows


@router.post("", status_code=201)
def create_plan(body: PlanIn, con=Depends(get_con),
                user: Auth = Depends(require("admin", "head_office", "factory_manager"))):
    if body.status not in STATUSES:
        raise HTTPException(400, f"status must be one of {', '.join(STATUSES)}")
    if not body.area.strip():
        raise HTTPException(400, "area is required")
    with transaction(con):
        cur = con.execute(
            "INSERT INTO reduction_plans(area,description,owner,target_date,status,linked_category_key,"
            "assumptions,created_at) VALUES (?,?,?,?,?,?,?,?)",
            (body.area.strip(), body.description, body.owner, body.target_date, body.status,
             body.linked_category_key, body.assumptions, now_iso()))
    return con.execute("SELECT * FROM reduction_plans WHERE plan_id=?", (cur.lastrowid,)).fetchone()


@router.patch("/{plan_id}")
def update_plan(plan_id: int, body: PlanIn, con=Depends(get_con),
                user: Auth = Depends(require("admin", "head_office", "factory_manager"))):
    row = con.execute("SELECT plan_id FROM reduction_plans WHERE plan_id=?", (plan_id,)).fetchone()
    if row is None:
        raise HTTPException(404, "plan not found")
    if body.status not in STATUSES:
        raise HTTPException(400, f"status must be one of {', '.join(STATUSES)}")
    with transaction(con):
        con.execute("UPDATE reduction_plans SET area=?, description=?, owner=?, target_date=?, status=?, "
                    "linked_category_key=?, assumptions=? WHERE plan_id=?",
                    (body.area.strip(), body.description, body.owner, body.target_date, body.status,
                     body.linked_category_key, body.assumptions, plan_id))
    return con.execute("SELECT * FROM reduction_plans WHERE plan_id=?", (plan_id,)).fetchone()
