from fastapi import Depends
from tori_core import Identity, build_auth_router, create_app, get_identity, mount_frontend

app = create_app("__APP_NAME__", title="__APP_TITLE__")
app.include_router(build_auth_router())  # bỏ dòng này nếu app không cần đăng nhập


@app.get("/api/hello")
def hello() -> dict:
    return {"message": "Xin chào từ __APP_TITLE__!"}


@app.get("/api/private")
def private(user: Identity = Depends(get_identity)) -> dict:
    """Ví dụ API cần đăng nhập."""
    return {"message": f"Chào {user.name or user.email}"}


mount_frontend(app)  # luôn để cuối, sau mọi route /api
