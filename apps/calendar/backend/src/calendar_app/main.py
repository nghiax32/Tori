from contextlib import asynccontextmanager

from tori_core import build_auth_router, create_app, mount_frontend

from calendar_app import api
from calendar_app.db import init_db


@asynccontextmanager
async def lifespan(_app):
    init_db()
    yield


app = create_app("calendar", title="Calendar", lifespan=lifespan)
app.include_router(build_auth_router(on_login=api.record_login))
app.include_router(api.router)
mount_frontend(app)
