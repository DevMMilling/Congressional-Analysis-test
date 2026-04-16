from __future__ import annotations

from dataclasses import dataclass

from fastapi import Query, Response
from sqlalchemy import Select, func, select
from sqlalchemy.orm import Session


@dataclass(slots=True)
class ListParams:
    page: int = 1
    page_size: int = 100
    sort: str | None = None
    order: str = "desc"


def pagination_params(
    page: int = Query(1, ge=1),
    page_size: int = Query(100, ge=1, le=200),
    sort: str | None = Query(None),
    order: str = Query("desc", pattern="^(asc|desc)$"),
) -> ListParams:
    return ListParams(page=page, page_size=page_size, sort=sort, order=order)


def apply_paging(query: Select, params: ListParams) -> Select:
    offset = max(params.page - 1, 0) * params.page_size
    return query.offset(offset).limit(params.page_size)


def set_paging_headers(response: Response, db: Session, query: Select, params: ListParams) -> None:
    total = db.execute(select(func.count()).select_from(query.order_by(None).subquery())).scalar_one()
    page_count = max((total + params.page_size - 1) // params.page_size, 1)
    response.headers["X-Total-Count"] = str(total)
    response.headers["X-Page"] = str(params.page)
    response.headers["X-Page-Size"] = str(params.page_size)
    response.headers["X-Page-Count"] = str(page_count)
