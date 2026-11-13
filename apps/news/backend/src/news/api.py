from datetime import UTC, date, datetime
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel
from sqlalchemy import case, select
from sqlalchemy.orm import Session
from tori_core import Identity, get_identity, get_settings

from news import sync
from news.config import get_news_settings
from news.db import get_session
from news.models import Bulletin, SyncState
from news.parser import normalize
from news.render import to_html

router = APIRouter(prefix="/api", tags=["news"])
SessionDep = Annotated[Session, Depends(get_session)]


def owner(request: Request) -> Identity:
    """Chỉ chủ hộp thư (NEWS_OWNER_EMAILS) được xem: bản tin lấy từ Gmail riêng."""
    identity = get_identity(request)
    owners = get_news_settings().owner_emails
    if owners and identity.email.lower() in owners:
        return identity
    if not owners and get_settings().is_dev:
        return identity
    raise HTTPException(status_code=403, detail="Bạn không có quyền xem bản tin này.")


OwnerDep = Annotated[Identity, Depends(owner)]


class BulletinSummary(BaseModel):
    id: int
    edition: str
    bulletin_date: date
    title: str


class BulletinOut(BulletinSummary):
    html: str
    received_at: datetime


class StatusOut(BaseModel):
    configured: bool
    last_run_at: datetime | None
    last_ok: bool | None
    last_error: str | None
    last_added: int
    next_run_at: datetime | None


def _utc(dt: datetime | None) -> datetime | None:
    return dt.replace(tzinfo=UTC) if dt is not None and dt.tzinfo is None else dt


@router.get("/bulletins")
def list_bulletins(_: OwnerDep, session: SessionDep, q: str = "", limit: int = 200) -> list[BulletinSummary]:
    """Mới nhất trước; trong một ngày bản tối đứng trước bản sáng."""
    stmt = select(Bulletin).order_by(
        Bulletin.bulletin_date.desc(), case((Bulletin.edition == "evening", 0), else_=1)
    )
    for word in normalize(q).split():
        stmt = stmt.where(Bulletin.search_text.contains(word, autoescape=True))
    return [BulletinSummary.model_validate(b, from_attributes=True) for b in session.scalars(stmt.limit(min(limit, 500)))]


@router.get("/bulletins/{bulletin_id}")
def get_bulletin(bulletin_id: int, _: OwnerDep, session: SessionDep) -> BulletinOut:
    b = session.get(Bulletin, bulletin_id)
    if b is None:
        raise HTTPException(status_code=404, detail="Không tìm thấy bản tin.")
    return BulletinOut(
        id=b.id,
        edition=b.edition,
        bulletin_date=b.bulletin_date,
        title=b.title,
        html=to_html(b.body_md),
        received_at=_utc(b.received_at),
    )


def _status(session: Session) -> StatusOut:
    from zoneinfo import ZoneInfo

    settings = get_news_settings()
    state = session.get(SyncState, 1)
    times = settings.fetch_times
    now = datetime.now(ZoneInfo(get_settings().timezone))
    return StatusOut(
        configured=settings.gmail_configured,
        last_run_at=_utc(state.last_run_at) if state else None,
        last_ok=state.last_ok if state else None,
        last_error=state.last_error if state else None,
        last_added=state.last_added if state else 0,
        next_run_at=sync.next_run(now, times) if settings.gmail_configured and times else None,
    )


@router.get("/status")
def status(_: OwnerDep, session: SessionDep) -> StatusOut:
    return _status(session)


@router.post("/sync")
def sync_now(_: OwnerDep, session: SessionDep) -> StatusOut:
    """Quét Gmail ngay (nút "Quét ngay"), không chờ tới giờ quét."""
    sync.run_sync()
    session.expire_all()
    return _status(session)
