"""Emission factor library endpoints: search, ranked suggestion, coverage, sources, audit,
and the versioned write/verify operations (every change requires a reason - library rule)."""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from api.deps import Auth, get_con, require
from api.util import rows_list
from services import factor_library as FL

router = APIRouter(prefix="/api/factors", tags=["factors"])


class FactorIn(BaseModel):
    factor_id: str
    country_code: str
    factor_class: str
    category: str
    activity: str
    unit: str
    value: str
    year_from: int
    year_to: int
    reference_id: str | None = None
    source_organization: str
    source_document: str
    source_url: str | None = None
    source_locator: str
    reason: str
    boundary_note: str = ""
    methodology: str = ""
    gwp_set_id: str | None = None
    notes: str | None = None
    publication_year: int | None = None


class VerifyIn(BaseModel):
    status: str
    reviewer_reason: str
    reference_id: str | None = None


@router.get("")
def search_factors(country: str | None = None, category: str | None = None, sector: str | None = None,
                   activity_like: str | None = None, scope: str | None = None, year: int | None = None,
                   organization: str | None = None, unit: str | None = None, status: str | None = None,
                   factor_class: str | None = None, con=Depends(get_con), user: Auth = Depends(require("admin", "head_office", "factory_manager", "viewer"))):
    rows = FL.search_factors(con, country=country, category=category, sector=sector,
                             activity_like=activity_like, scope=scope, year=year,
                             organization=organization, unit=unit, status=status, factor_class=factor_class)
    return rows_list(rows)


@router.get("/suggest")
def suggest(country: str, category: str, year: int, unit: str, fuel: str | None = None,
            con=Depends(get_con), user: Auth = Depends(require("admin", "head_office", "factory_manager", "viewer"))):
    sg = FL.suggest(con, country=country, category=category, year=year, unit=unit, fuel=fuel)
    return {
        "message": sg.message,
        "chosen": (None if sg.chosen is None else {
            "factor": {k: (str(v) if hasattr(v, "isoformat") else v) for k, v in
                       [("factor_id", sg.chosen.factor.factor_id), ("version", sg.chosen.factor.version),
                        ("country", sg.chosen.factor.country), ("category", sg.chosen.factor.category),
                        ("activity", sg.chosen.factor.activity),
                        ("denominator_unit", sg.chosen.factor.denominator_unit),
                        ("total_co2e", str(sg.chosen.factor.total_co2e)),
                        ("status", sg.chosen.factor.status.value),
                        ("classification", sg.chosen.factor.classification.value),
                        ("source_org", sg.chosen.factor.source_org),
                        ("source_title", sg.chosen.factor.source_title),
                        ("source_url", sg.chosen.factor.source_url),
                        ("boundary_note", sg.chosen.factor.boundary_note)]},
            "tier": sg.chosen.tier, "reason": sg.chosen.reason,
            "needs_proxy_confirmation": sg.chosen.needs_proxy_confirmation,
            "usable_without_confirmation": sg.chosen.usable_without_confirmation}),
        "candidates": [{"factor_id": c.factor.factor_id, "version": c.factor.version,
                        "activity": c.factor.activity, "country": c.factor.country,
                        "unit": c.factor.denominator_unit, "value": str(c.factor.total_co2e),
                        "tier": c.tier, "status": c.factor.status.value,
                        "classification": c.factor.classification.value,
                        "national": c.is_national_for_activity, "verified": c.verified,
                        "needs_proxy_confirmation": c.needs_proxy_confirmation,
                        "usable_without_confirmation": c.usable_without_confirmation,
                        "reason": c.reason} for c in sg.candidates],
        "excluded": [{"factor_id": f, "reason": r} for f, r in sg.excluded],
    }


@router.get("/coverage")
def coverage(con=Depends(get_con), user: Auth = Depends(require("admin", "head_office", "factory_manager", "viewer"))):
    return rows_list(FL.countries_coverage(con))


@router.get("/audit")
def factor_audit(factor_id: str | None = None, con=Depends(get_con), user: Auth = Depends(require("admin", "head_office"))):
    return rows_list(FL.audit_log(con, factor_id))


@router.post("", status_code=201)
def add_factor(body: FactorIn, con=Depends(get_con), user: Auth = Depends(require("admin", "head_office"))):
    try:
        ver = FL.add_factor(con, factor_id=body.factor_id.strip(), country_code=body.country_code.strip().upper(),
                            factor_class=body.factor_class, category=body.category, activity=body.activity,
                            unit=body.unit, value=body.value, year_from=body.year_from, year_to=body.year_to,
                            reference_id=body.reference_id, source_organization=body.source_organization,
                            source_document=body.source_document, source_url=body.source_url,
                            source_locator=body.source_locator, reason=body.reason, user=user.username,
                            boundary_note=body.boundary_note, methodology=body.methodology,
                            gwp_set_id=body.gwp_set_id, notes=body.notes,
                            publication_year=body.publication_year)
    except ValueError as e:
        raise HTTPException(400, str(e))
    return {"factor_id": body.factor_id.strip(), "version": ver}


@router.post("/{factor_id}/{version}/verify")
def verify_factor(factor_id: str, version: int, body: VerifyIn, con=Depends(get_con),
                  user: Auth = Depends(require("admin"))):
    try:
        FL.set_verification(con, factor_id, version, body.status, reviewer=user.username,
                            reason=body.reviewer_reason, reference_id=body.reference_id)
    except (ValueError, LookupError, PermissionError) as e:
        raise HTTPException(400, str(e))
    f = FL.get_factor(con, factor_id, version)
    return {"factor_id": factor_id, "version": version, "status": body.status}


@router.get("/sources")
def sources(con=Depends(get_con), user: Auth = Depends(require("admin", "head_office", "factory_manager", "viewer"))):
    return rows_list(con.execute("SELECT * FROM sources ORDER BY reference_id").fetchall())


@router.get("/gwp-sets")
def gwp_sets(user: Auth = Depends(require("admin", "head_office", "factory_manager", "viewer"))):
    from services.gwp import REGISTRY
    return [{"set_id": s.set_id, "horizon_years": s.horizon_years,
             "values": {k: str(v) for k, v in s.values.items()}, "source": s.source, "note": s.note}
            for s in REGISTRY.values()]
