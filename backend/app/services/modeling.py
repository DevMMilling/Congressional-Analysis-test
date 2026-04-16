from __future__ import annotations

import json
from datetime import date
from pathlib import Path

import pandas as pd
from sklearn.ensemble import HistGradientBoostingClassifier, HistGradientBoostingRegressor
from sklearn.metrics import mean_absolute_error, mean_squared_error, roc_auc_score
from sqlalchemy.orm import Session

from ..config import get_settings
from ..models import Prediction
from .features import feature_frame


settings = get_settings()


def retrain_models(db: Session) -> dict:
    frame = feature_frame(db)
    if frame.empty or len(frame) < 10:
        return {"status": "skipped", "reason": "Not enough feature rows to train models."}

    frame = _prepare_frame(frame)
    cutoff = max(int(len(frame) * 0.8), 1)
    train = frame.iloc[:cutoff]
    test = frame.iloc[cutoff:] if cutoff < len(frame) else frame.iloc[-1:]
    feature_cols = [col for col in frame.columns if col not in {"snapshot_id", "snapshot_date", "target", "target_trade_probability", "trade_id"}]

    classifier = HistGradientBoostingClassifier(max_depth=4, random_state=42)
    classifier.fit(train[feature_cols], train["target_trade_probability"])
    clf_probs = classifier.predict_proba(test[feature_cols])[:, 1]
    auc = roc_auc_score(test["target_trade_probability"], clf_probs) if test["target_trade_probability"].nunique() > 1 else None

    regressor = HistGradientBoostingRegressor(max_depth=4, random_state=42)
    regressor.fit(train[feature_cols], train["target"])
    reg_preds = regressor.predict(test[feature_cols])
    rmse = mean_squared_error(test["target"], reg_preds, squared=False)
    mae = mean_absolute_error(test["target"], reg_preds)

    _persist_predictions(db, frame, classifier, regressor, feature_cols)
    _save_model_report({"trained_at": date.today().isoformat(), "feature_columns": feature_cols, "classifier_auc": auc, "regressor_rmse": rmse, "regressor_mae": mae})
    return {"status": "completed", "classifier_auc": auc, "regressor_rmse": rmse, "regressor_mae": mae}


def _prepare_frame(frame: pd.DataFrame) -> pd.DataFrame:
    ordered = frame.sort_values("snapshot_date").reset_index(drop=True).copy()
    for column in ["transaction_type", "disclosure_lag_days", "amount_mid", "ticker_trade_frequency", "politician_trade_frequency"]:
        ordered[column] = ordered[column].fillna(0)
    for column in ["sector", "party", "chamber", "ticker"]:
        ordered[column] = pd.Categorical(ordered[column].fillna("Unknown")).codes
    ordered["target_trade_probability"] = ordered["target_trade_probability"].fillna(0)
    ordered["target"] = ordered["target"].fillna(0.0)
    return ordered


def _persist_predictions(db: Session, frame: pd.DataFrame, classifier, regressor, feature_cols: list[str]) -> None:
    db.query(Prediction).delete()
    db.commit()
    predicted = frame.tail(min(50, len(frame))).copy()
    predicted["trade_probability"] = classifier.predict_proba(predicted[feature_cols])[:, 1]
    predicted["expected_return"] = regressor.predict(predicted[feature_cols])
    for _, row in predicted.iterrows():
        entity_key = f"trade:{int(row['snapshot_id'])}"
        db.add(
            Prediction(
                prediction_date=row["snapshot_date"],
                model_name="trade_probability_model",
                entity_type="trade_event",
                entity_key=entity_key,
                score=float(row["trade_probability"]),
                confidence=float(row["trade_probability"]),
                prediction_payload={"feature_snapshot_id": int(row["snapshot_id"]), "trade_id": int(row["trade_id"])},
            )
        )
        db.add(
            Prediction(
                prediction_date=row["snapshot_date"],
                model_name="post_disclosure_return_model",
                entity_type="trade_event",
                entity_key=entity_key,
                score=float(row["expected_return"]),
                confidence=min(abs(float(row["expected_return"])) * 5, 1.0),
                prediction_payload={"feature_snapshot_id": int(row["snapshot_id"]), "trade_id": int(row["trade_id"])},
            )
        )
    db.commit()


def _save_model_report(payload: dict) -> None:
    Path(settings.model_dir, "model_report.json").write_text(json.dumps(payload, indent=2), encoding="utf-8")
