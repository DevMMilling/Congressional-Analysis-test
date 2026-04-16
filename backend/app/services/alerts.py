from __future__ import annotations

from datetime import datetime
import smtplib
from email.message import EmailMessage

from sqlalchemy import select
from sqlalchemy.orm import Session

from ..config import get_settings
from ..models import AlertHistory, AlertSubscription, Signal


settings = get_settings()


def create_subscription(db: Session, email: str, enabled: bool, minimum_confidence: float, signal_types: list[str]) -> AlertSubscription:
    subscription = AlertSubscription(email=email, enabled=enabled, minimum_confidence=minimum_confidence, signal_types=signal_types)
    db.add(subscription)
    db.commit()
    db.refresh(subscription)
    return subscription


def dispatch_alerts(db: Session) -> int:
    subscriptions = db.execute(select(AlertSubscription).where(AlertSubscription.enabled.is_(True))).scalars().all()
    if not subscriptions:
        return 0
    signals = db.execute(select(Signal).order_by(Signal.signal_date.desc()).limit(10)).scalars().all()
    sent = 0
    for subscription in subscriptions:
        filtered = [signal for signal in signals if (signal.confidence or 0) >= subscription.minimum_confidence and signal.signal_type in (subscription.signal_types or [])]
        if not filtered:
            continue
        status = "smtp_disabled"
        sent_at = None
        if settings.smtp_enabled:
            try:
                _send_email(subscription.email, filtered)
            except Exception:
                status = "failed"
            else:
                status = "sent"
                sent_at = datetime.utcnow()
        for signal in filtered:
            db.add(
                AlertHistory(
                    subscription_id=subscription.id,
                    signal_id=signal.id,
                    status=status,
                    sent_at=sent_at,
                    payload={"email": subscription.email, "signal_type": signal.signal_type},
                )
            )
        db.commit()
        sent += len(filtered)
    return sent


def list_alert_history(db: Session, limit: int = 100, subscription_id: int | None = None, status: str | None = None) -> list[dict]:
    query = (
        select(AlertHistory, AlertSubscription.email, Signal.signal_type, Signal.ticker)
        .outerjoin(AlertSubscription, AlertSubscription.id == AlertHistory.subscription_id)
        .outerjoin(Signal, Signal.id == AlertHistory.signal_id)
        .order_by(AlertHistory.created_at.desc(), AlertHistory.id.desc())
    )
    if subscription_id is not None:
        query = query.where(AlertHistory.subscription_id == subscription_id)
    if status:
        query = query.where(AlertHistory.status == status)
    rows = db.execute(query.limit(limit)).all()
    return [
        {
            "id": history.id,
            "subscription_id": history.subscription_id,
            "subscription_email": subscription_email,
            "signal_id": history.signal_id,
            "signal_type": signal_type,
            "ticker": ticker,
            "status": history.status,
            "sent_at": history.sent_at,
            "created_at": history.created_at,
            "payload": history.payload or {},
        }
        for history, subscription_email, signal_type, ticker in rows
    ]


def send_test_alert(db: Session, recipient: str | None = None) -> dict:
    recipient_email = recipient or settings.alert_to_email
    history = AlertHistory(
        subscription_id=None,
        signal_id=None,
        status="smtp_disabled",
        sent_at=None,
        payload={"email": recipient_email, "kind": "test", "smtp_enabled": settings.smtp_enabled},
    )
    message = "SMTP is disabled; test alert recorded locally."
    if settings.smtp_enabled:
        try:
            _send_test_email(recipient_email)
        except Exception as exc:  # pragma: no cover - defensive, surfaced through response and history
            history.status = "failed"
            history.payload = {**(history.payload or {}), "error": str(exc)}
            message = f"Test alert failed: {exc}"
        else:
            history.status = "sent"
            history.sent_at = datetime.utcnow()
            message = "Test alert sent."

    db.add(history)
    db.commit()
    db.refresh(history)
    return {
        "status": history.status,
        "message": message,
        "recipient": recipient_email,
        "smtp_enabled": settings.smtp_enabled,
        "history_id": history.id,
    }


def _send_email(recipient: str, signals: list[Signal]) -> None:
    message = EmailMessage()
    message["Subject"] = "Congressional trading signals"
    message["From"] = settings.smtp_from_email
    message["To"] = recipient
    body = ["Latest congressional trading signals:", ""]
    for signal in signals:
        body.append(f"- {signal.signal_date}: {signal.signal_type} {signal.ticker or ''} score={signal.score:.2f} confidence={signal.confidence or 0:.2f}")
    message.set_content("\n".join(body))
    with smtplib.SMTP(settings.smtp_host, settings.smtp_port) as server:
        if settings.smtp_username:
            server.starttls()
            server.login(settings.smtp_username, settings.smtp_password)
        server.send_message(message)


def _send_test_email(recipient: str) -> None:
    message = EmailMessage()
    message["Subject"] = "Congressional trading alert test"
    message["From"] = settings.smtp_from_email
    message["To"] = recipient
    message.set_content(
        "This is a test alert from the Congressional Trading Intelligence App.\n"
        f"SMTP enabled: {settings.smtp_enabled}\n"
    )
    with smtplib.SMTP(settings.smtp_host, settings.smtp_port) as server:
        if settings.smtp_username:
            server.starttls()
            server.login(settings.smtp_username, settings.smtp_password)
        server.send_message(message)
