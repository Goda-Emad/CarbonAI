"""Refrigerants & cooling API: refrigerant database, equipment inventory, service/leakage
records and the Scope 1 refrigerant KPI. Backend enforces tenancy and admin-only management."""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from api.deps import Auth, current_user, get_con, require, resolve_scope
from services import cooling as C

router = APIRouter(prefix="/api", tags=["cooling"])


class EquipmentIn(BaseModel):
    facility_id: int | None = None
    identifier: str
    equipment_type: str = "commercial_ac"
    refrigerant_key: str | None = None
    charge_kg: str | None = None
    installed_year: int | None = None
    notes: str = ""


class ServiceIn(BaseModel):
    equipment_id: int
    service_date: str
    gwp_basis: str = "AR5"
    added_kg: str | None = None
    recovered_kg: str | None = None
    leaked_kg: str | None = None
    ownership_control: str = "owned_controlled"
    evidence_ref: str | None = None
    notes: str = ""


@router.get("/refrigerants")
def refrigerants(con=Depends(get_con),
                 user: Auth = Depends(require("admin", "head_office", "factory_manager", "viewer"))):
    return C.list_refrigerants(con)


@router.get("/refrigerants/{key}")
def refrigerant(key: str, con=Depends(get_con),
                user: Auth = Depends(require("admin", "head_office", "factory_manager", "viewer"))):
    r = C.get_refrigerant(con, key.upper())
    if r is None:
        raise HTTPException(404, "refrigerant not found")
    return r


@router.get("/cooling/equipment")
def equipment(company_id: int | None = None, facility_id: int | None = None,
              con=Depends(get_con),
              user: Auth = Depends(require("admin", "head_office", "factory_manager", "viewer"))):
    cid, fid = resolve_scope(user, company_id, facility_id)
    return C.list_equipment(con, company_id=cid, facility_id=fid)


@router.post("/cooling/equipment", status_code=201)
def add_equipment(body: EquipmentIn, con=Depends(get_con),
                  user: Auth = Depends(require("admin", "head_office", "factory_manager"))):
    if user.is_factory_scoped and body.facility_id is not None and body.facility_id != user.facility_id:
        raise HTTPException(403, "you can only register equipment for your own facility")
    facility_id = body.facility_id if not user.is_factory_scoped else user.facility_id
    if facility_id is None:
        raise HTTPException(400, "facility_id is required")
    if user.is_factory_scoped and facility_id != user.facility_id:
        raise HTTPException(403, "you can only register equipment for your own facility")
    fac = con.execute("SELECT company_id FROM facilities WHERE facility_id=?", (facility_id,)).fetchone()
    if fac is None:
        raise HTTPException(404, "facility not found")
    if user.role == "head_office" and fac["company_id"] != user.company_id:
        raise HTTPException(403, "facility belongs to another company")
    try:
        return C.add_equipment(con, facility_id=facility_id, company_id=fac["company_id"],
                               identifier=body.identifier, equipment_type=body.equipment_type,
                               refrigerant_key=body.refrigerant_key, charge_kg=body.charge_kg,
                               installed_year=body.installed_year, notes=body.notes,
                               user=user.username)
    except C.CoolingError as e:
        raise HTTPException(400, str(e))


@router.get("/cooling/records")
def records(company_id: int | None = None, facility_id: int | None = None,
            equipment_id: int | None = None, year: int | None = None,
            con=Depends(get_con),
            user: Auth = Depends(require("admin", "head_office", "factory_manager", "viewer"))):
    cid, fid = resolve_scope(user, company_id, facility_id)
    return C.list_service_records(con, company_id=cid, facility_id=fid,
                                  equipment_id=equipment_id, year=year)


@router.post("/cooling/records", status_code=201)
def add_record(body: ServiceIn, con=Depends(get_con),
               user: Auth = Depends(require("admin", "head_office", "factory_manager"))):
    eq = con.execute("SELECT e.facility_id, e.company_id FROM cooling_equipment e "
                     "WHERE e.equipment_id=?", (body.equipment_id,)).fetchone()
    if eq is None:
        raise HTTPException(404, "equipment not found")
    if user.is_factory_scoped and eq["facility_id"] != user.facility_id:
        raise HTTPException(403, "equipment belongs to another facility")
    if user.role == "head_office" and eq["company_id"] != user.company_id:
        raise HTTPException(403, "equipment belongs to another company")
    try:
        return C.add_service_record(
            con, equipment_id=body.equipment_id, service_date=body.service_date,
            gwp_basis=body.gwp_basis, added_kg=body.added_kg, recovered_kg=body.recovered_kg,
            leaked_kg=body.leaked_kg, ownership_control=body.ownership_control,
            evidence_ref=body.evidence_ref, notes=body.notes, user=user.username)
    except C.CoolingError as e:
        raise HTTPException(400, str(e))


@router.get("/cooling/kpi")
def kpi(company_id: int | None = None, facility_id: int | None = None, year: int | None = None,
        con=Depends(get_con),
        user: Auth = Depends(require("admin", "head_office", "factory_manager", "viewer"))):
    cid, fid = resolve_scope(user, company_id, facility_id)
    return C.kpi(con, company_id=cid, facility_id=fid, year=year)
