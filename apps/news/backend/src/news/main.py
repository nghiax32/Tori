import asyncio
from contextlib import asynccontextmanager

from tori_core import build_auth_router, create_app, mount_frontend

from news import api, sync
from news.config import get_news_settings
from news.db import init_db


@asynccontextmanager
async def lifespan(_app):
    init_db()
    # Chưa cấu hình Gmail thì không chạy lịch quét (trang vẫn mở được, hiện hướng dẫn)
    task = asyncio.create_task(sync.schedule_loop()) if get_news_settings().gmail_configured else None
    try:
        yield
    finally:
        if task:
            task.cancel()


app = create_app("news", title="Bản tin", lifespan=lifespan)
app.include_router(build_auth_router())
app.include_router(api.router)
mount_frontend(app)  # luôn để cuối, sau mọi route /api
