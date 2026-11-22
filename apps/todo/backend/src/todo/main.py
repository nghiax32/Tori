from contextlib import asynccontextmanager

from tori_core import build_auth_router, create_app, mount_frontend

from todo import api
from todo.db import init_db
from todo.users import record_login


@asynccontextmanager
async def lifespan(_app):
    init_db()
    yield


app = create_app("todo", title="Việc cần làm", lifespan=lifespan)
app.include_router(build_auth_router(on_login=record_login))
app.include_router(api.router)
mount_frontend(app)  # luôn để cuối, sau mọi route /api
