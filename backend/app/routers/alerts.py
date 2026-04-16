from fastapi import APIRouter, Depends
from pydantic import EmailStr
from sqlalchemy.orm import Session

from ..db import get_db
from ..schemas import AlertDispatchResponse, AlertHistoryResponse, AlertSubscriptionCreate, AlertSubscriptionResponse
from ..services.alerts import create_subscription, dispatch_alerts, list_alert_history, send_test_alert

router = APIRouter(tags=["alerts"])


@router.post("/alerts/subscriptions", response_model=AlertSubscriptionResponse)
def create_alert_subscription(payload: AlertSubscriptionCreate, db: Session = Depends(get_db)) -> AlertSubscriptionResponse:
    subscription = create_subscription(
        db,
        email=str(payload.email),
        enabled=payload.enabled,
        minimum_confidence=payload.minimum_confidence,
        signal_types=payload.signal_types,
    )
    return AlertSubscriptionResponse(
        id=subscription.id,
        email=subscription.email,
        enabled=subscription.enabled,
        minimum_confidence=subscription.minimum_confidence,
        signal_types=subscription.signal_types or [],
    )


@router.post("/alerts/dispatch")
def send_alerts(db: Session = Depends(get_db)) -> dict:
    return {"alerts_processed": dispatch_alerts(db)}


@router.get("/alerts/history", response_model=list[AlertHistoryResponse])
def alert_history(
    limit: int = 100,
    subscription_id: int | None = None,
    status: str | None = None,
    db: Session = Depends(get_db),
) -> list[AlertHistoryResponse]:
    return [AlertHistoryResponse.model_validate(row) for row in list_alert_history(db, limit=limit, subscription_id=subscription_id, status=status)]


@router.post("/alerts/test-dispatch", response_model=AlertDispatchResponse)
def test_dispatch(recipient: EmailStr | None = None, db: Session = Depends(get_db)) -> AlertDispatchResponse:
    result = send_test_alert(db, recipient=recipient)
    return AlertDispatchResponse(**result)
