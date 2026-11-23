from contextlib import asynccontextmanager

from tori_core import build_auth_router, create_app, mount_frontend

from note import api
from note.db import init_db
from note.users import record_login


@asynccontextmanager
async def lifespan(_app):
    init_db()
    yield


app = create_app("note", title="Ghi chú", lifespan=lifespan)
app.include_router(build_auth_router(on_login=record_login))
app.include_router(api.router)
mount_frontend(app)  # luôn để cuối, sau mọi route /api
