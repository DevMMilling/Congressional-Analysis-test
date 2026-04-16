import json

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from ..config import get_settings
from ..db import get_db
from ..services.features import rebuild_feature_snapshots
from ..services.modeling import retrain_models
from ..services.signals import rebuild_signals

router = APIRouter(tags=["models"])
settings = get_settings()


@router.post("/models/retrain", summary="Retrain ML models", operation_id="retrain_models")
def retrain(db: Session = Depends(get_db)) -> dict:
    features = rebuild_feature_snapshots(db)
    metrics = retrain_models(db)
    signals = rebuild_signals(db)
    return {"features_rebuilt": features, "signals_rebuilt": signals, "model_metrics": metrics}


@router.get("/models/report", summary="Get latest model performance report", operation_id="get_model_report")
def get_model_report() -> dict:
    """Return the saved model metrics report (AUC, RMSE, MAE, trained_at, feature_columns)."""
    report_path = settings.model_dir / "model_report.json"
    if not report_path.exists():
        raise HTTPException(
            status_code=404,
            detail="No model report found. Run POST /api/models/retrain first.",
        )
    try:
        return json.loads(report_path.read_text(encoding="utf-8"))
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Failed to read model report: {exc}") from exc
