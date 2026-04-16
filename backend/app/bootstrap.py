from sqlalchemy.orm import Session

from .db import Base, engine
from .models import AlertSubscription


def bootstrap_database() -> None:
    Base.metadata.create_all(bind=engine)


def ensure_default_records(db: Session) -> None:
    existing = db.query(AlertSubscription).count()
    if existing == 0:
        db.add(
            AlertSubscription(
                email="alerts@example.com",
                enabled=False,
                minimum_confidence=0.75,
                signal_types=["high_confidence", "unusual_buying"],
            )
        )
        db.commit()
