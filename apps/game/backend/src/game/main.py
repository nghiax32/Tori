from contextlib import asynccontextmanager

from tori_core import build_auth_router, create_app, mount_frontend

from game import api
from game.db import init_db


@asynccontextmanager
async def lifespan(_app):
    init_db()
    yield


app = create_app("game", title="Trò chơi", lifespan=lifespan)
app.include_router(build_auth_router(on_login=api.record_login))
app.include_router(api.router)
mount_frontend(app)  # luôn để cuối, sau mọi route /api
