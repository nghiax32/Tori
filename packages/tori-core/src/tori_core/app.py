from pathlib import Path

from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from starlette.middleware.sessions import SessionMiddleware
from starlette.types import Scope

from tori_core.config import get_settings

SESSION_MAX_AGE = 30 * 24 * 3600


def create_app(name: str, *, title: str | None = None, lifespan=None) -> FastAPI:
    """Tạo app FastAPI chuẩn: cookie phiên (dùng chung mọi app), /api/health, /api/meta, docs ở /api/docs."""
    settings = get_settings()
    app = FastAPI(
        title=title or name,
        lifespan=lifespan,
        docs_url="/api/docs",
        redoc_url=None,
        openapi_url="/api/openapi.json",
    )
    app.add_middleware(
        SessionMiddleware,
        secret_key=settings.secret_key,
        # Một cookie chung cho hub và mọi subdomain: đăng nhập/đăng xuất một nơi là áp dụng cho tất cả
        session_cookie="tori_session",
        domain=settings.cookie_domain,
        max_age=SESSION_MAX_AGE,
        same_site="lax",
        https_only=settings.tori_scheme == "https",
    )

    @app.get("/api/health", tags=["meta"])
    def health() -> dict:
        return {"status": "ok", "app": name}

    @app.get("/api/meta", tags=["meta"])
    def meta() -> dict:
        return {"app": name, "title": title or name, "hub_url": settings.app_url(), "env": settings.tori_env}

    return app


class FrontendFiles(StaticFiles):
    """File frontend đã build, kèm Cache-Control để sau khi build lại trình duyệt không dùng giao diện cũ:
    - HTML: no-cache, mỗi lần mở trang đều hỏi lại server (không đổi thì chỉ nhận 304);
    - assets/: tên file có mã hash, mỗi bản build một tên, nên lưu lâu không sợ cũ."""

    async def get_response(self, path: str, scope: Scope):
        response = await super().get_response(path, scope)
        if response.status_code in (200, 304):
            if path.startswith("assets/"):
                response.headers["Cache-Control"] = "public, max-age=31536000, immutable"
            # 304 của Starlette không kèm content-type: ngoài assets/ thì cũng bắt hỏi lại server
            elif response.status_code == 304 or response.headers.get("content-type", "").startswith("text/html"):
                response.headers["Cache-Control"] = "no-cache"
        return response


def mount_frontend(app: FastAPI, static_dir: Path | None = None) -> None:
    """Phục vụ frontend đã build ở '/'. Gọi SAU khi đã khai báo hết route /api."""
    directory = static_dir or get_settings().static_dir
    if directory and Path(directory).is_dir():
        app.mount("/", FrontendFiles(directory=directory, html=True), name="frontend")
