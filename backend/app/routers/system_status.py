from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from ..db import get_db
from ..schemas import SystemStatusResponse
from ..services.system_status import build_system_status

router = APIRouter(tags=["system_status"])


@router.get("/system/status", response_model=SystemStatusResponse)
def get_system_status(db: Session = Depends(get_db)) -> SystemStatusResponse:
    return build_system_status(db)
