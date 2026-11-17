from contextlib import asynccontextmanager

from tori_core import build_auth_router, create_app, mount_frontend

from learningenglish import api, daily
from learningenglish.db import init_db
from learningenglish.users import record_login


@asynccontextmanager
async def lifespan(_app):
    init_db()
    yield


app = create_app("learningenglish", title="Học Tiếng Anh", lifespan=lifespan)
app.include_router(build_auth_router(on_login=record_login))
app.include_router(api.router)
app.include_router(daily.router)
mount_frontend(app)  # luôn để cuối, sau mọi route /api
