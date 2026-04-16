from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from ..db import get_db
from ..schemas import JobRunResponse
from ..services.research import list_jobs

router = APIRouter(tags=["jobs"])


@router.get("/jobs", response_model=list[JobRunResponse])
def get_jobs(limit: int = Query(50, ge=1, le=200), db: Session = Depends(get_db)) -> list[JobRunResponse]:
    return [JobRunResponse.model_validate(job) for job in list_jobs(db, limit=limit)]
