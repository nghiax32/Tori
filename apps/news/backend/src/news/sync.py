"""Quét Gmail lấy bản tin mới, và lịch quét hằng ngày."""

import asyncio
import logging
from datetime import UTC, datetime, time, timedelta
from typing import Protocol

from sqlalchemy import select
from sqlalchemy.orm import Session
from tori_core import get_settings

from news.config import get_news_settings
from news.db import SessionLocal
from news.gmail import GmailAuthError, GmailClient
from news.models import Bulletin, SyncState
from news.parser import normalize, parse_message

log = logging.getLogger("news")


class MailSource(Protocol):
    def search(self, query: str, limit: int = 20) -> list[str]: ...
    def raw(self, message_id: str) -> bytes: ...


def _state(session: Session) -> SyncState:
    state = session.get(SyncState, 1)
    if state is None:
        state = SyncState(id=1)
        session.add(state)
    return state


def import_messages(session: Session, source: MailSource, query: str) -> int:
    """Lấy các email khớp `query` chưa có trong DB, lưu thành bản tin. Trả về số bản tin thêm/cập nhật."""
    timezone = get_settings().timezone
    known = set(session.scalars(select(Bulletin.gmail_id)))
    added = 0
    for message_id in source.search(query):
        if message_id in known:
            continue
        parsed = parse_message(source.raw(message_id), timezone)
        if parsed is None:
            continue
        existing = session.scalar(
            select(Bulletin).where(Bulletin.bulletin_date == parsed.bulletin_date, Bulletin.edition == parsed.edition)
        )
        if existing is not None and existing.received_at.replace(tzinfo=UTC) >= parsed.received_at:
            continue  # đã có bản mới hơn cho buổi này
        bulletin = existing or Bulletin()
        bulletin.gmail_id = message_id
        bulletin.edition = parsed.edition
        bulletin.bulletin_date = parsed.bulletin_date
        bulletin.title = parsed.title[:300]
        bulletin.body_md = parsed.body_md
        bulletin.search_text = normalize(f"{parsed.title}\n{parsed.body_md}")
        bulletin.received_at = parsed.received_at.astimezone(UTC)  # SQLite lưu không kèm múi giờ: luôn lưu UTC
        session.add(bulletin)
        session.flush()
        added += 1
    return added


def run_sync(source: MailSource | None = None) -> SyncState:
    """Một lần quét: chỉ xét email trong 24 giờ qua. Ghi lại kết quả để hiện trên trang."""
    settings = get_news_settings()
    with SessionLocal() as session:
        state = _state(session)
        state.last_run_at = datetime.now(UTC)
        try:
            if source is None:
                if not settings.gmail_configured:
                    raise RuntimeError("Chưa cấu hình Gmail (GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET, GMAIL_REFRESH_TOKEN).")
                source = GmailClient(settings.gmail_client_id, settings.gmail_client_secret, settings.gmail_refresh_token)
            state.last_added = import_messages(session, source, f"{settings.news_gmail_query} newer_than:1d")
            state.last_ok, state.last_error = True, None
        except GmailAuthError as e:
            state.last_ok, state.last_error, state.last_added = False, str(e), 0
        except Exception as e:  # lỗi mạng, Gmail trả lỗi...: ghi lại, lần sau quét tiếp
            log.exception("Quét Gmail thất bại")
            state.last_ok, state.last_error, state.last_added = False, f"Quét Gmail thất bại: {e}", 0
        session.commit()
        return state


def next_run(now: datetime, times: list[time]) -> datetime:
    """Lần quét kế tiếp sau `now` (có múi giờ), theo các giờ trong ngày `times`."""
    for day in (now.date(), now.date() + timedelta(days=1)):
        for t in times:
            candidate = datetime.combine(day, t, now.tzinfo)
            if candidate > now:
                return candidate
    raise ValueError("Chưa đặt giờ quét (NEWS_FETCH_TIMES)")


async def schedule_loop() -> None:
    """Quét vào các giờ cố định mỗi ngày. Server tắt đúng giờ quét thì bỏ qua, không quét bù."""
    from zoneinfo import ZoneInfo

    tz = ZoneInfo(get_settings().timezone)
    times = get_news_settings().fetch_times
    while True:
        now = datetime.now(tz)
        await asyncio.sleep((next_run(now, times) - now).total_seconds())
        await asyncio.to_thread(run_sync)
