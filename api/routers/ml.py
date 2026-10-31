"""ML endpoints. Status is always truthful; predict 404s when no model is trained rather than
inventing numbers. Training runs on this organisation's own ledger data only."""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from api.deps import Auth, get_con, require
from services import ml_model as M

router = APIRouter(prefix="/api/ml", tags=["ml"])


class PredictIn(BaseModel):
    quantity: float
    unit: str
    category_key: str | None = None
    scope: str | None = None
    activity_month: int | None = None


class TrainIn(BaseModel):
    min_rows: int = 40


@router.get("/status")
def status(user: Auth = Depends(require("admin", "head_office", "factory_manager", "viewer"))):
    return M.registry_status()


@router.post("/predict")
def predict(body: PredictIn, user: Auth = Depends(require("admin", "head_office", "factory_manager", "viewer"))):
    try:
        return M.predict({"quantity": body.quantity, "unit": body.unit,
                          "category_key": body.category_key, "scope": body.scope,
                          "activity_month": body.activity_month})
    except FileNotFoundError:
        raise HTTPException(404, "No trained model is loaded. Train one first (POST /api/ml/train).")
    except Exception as e:
        raise HTTPException(400, f"prediction failed: {e}")


@router.post("/train")
def train(body: TrainIn, user: Auth = Depends(require("admin"))):
    if not (2 <= body.min_rows <= 100000):
        raise HTTPException(400, "min_rows out of range")
    from scripts.train_emission_model import train
    result = train(min_rows=body.min_rows)
    if not result["ok"]:
        raise HTTPException(409, result["reason"])
    return result
