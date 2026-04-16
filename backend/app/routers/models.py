from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from ..db import get_db
from ..services.features import rebuild_feature_snapshots
from ..services.modeling import retrain_models
from ..services.signals import rebuild_signals

router = APIRouter(tags=["models"])


@router.post("/models/retrain")
def retrain(db: Session = Depends(get_db)) -> dict:
    features = rebuild_feature_snapshots(db)
    metrics = retrain_models(db)
    signals = rebuild_signals(db)
    return {"features_rebuilt": features, "signals_rebuilt": signals, "model_metrics": metrics}
