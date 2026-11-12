import asyncio
import logging
from contextlib import asynccontextmanager
from datetime import datetime, time, timedelta
from zoneinfo import ZoneInfo

from tori_core import build_auth_router, create_app, get_settings, mount_frontend

from calendar_app import api, generator
from calendar_app.db import SessionLocal, init_db

log = logging.getLogger("calendar")
RUN_AT = time(0, 5)  # 00:05 giờ địa phương mỗi ngày


def run_generation() -> int:
    with SessionLocal() as session:
        created = generator.generate_for_year(session, generator.today().year)
        session.commit()
    if created:
        log.info("Đã sinh %d lần xảy ra cho sự kiện thường niên", created)
    return created


async def _daily_loop() -> None:
    tz = ZoneInfo(get_settings().timezone)
    while True:
        try:
            await asyncio.to_thread(run_generation)
        except Exception:
            log.exception("Sinh sự kiện thường niên thất bại")
        now = datetime.now(tz)
        next_run = datetime.combine(now.date() + timedelta(days=1), RUN_AT, tz)
        await asyncio.sleep((next_run - now).total_seconds())


@asynccontextmanager
async def lifespan(_app):
    init_db()
    task = asyncio.create_task(_daily_loop())
    try:
        yield
    finally:
        task.cancel()


app = create_app("calendar", title="Calendar", lifespan=lifespan)
app.include_router(build_auth_router(on_login=api.record_login))
app.include_router(api.router)
mount_frontend(app)
