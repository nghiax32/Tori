"""Đăng nhập Google (OpenID Connect) dùng chung cho mọi app.

Danh tính người dùng được lưu trong cookie phiên (đã ký). Mỗi app tự quyết định có lưu
người dùng vào DB của nó hay không, thông qua callback `on_login`.
"""

from collections.abc import Callable
from dataclasses import asdict, dataclass

from authlib.integrations.starlette_client import OAuth, OAuthError
from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import RedirectResponse
from pydantic import BaseModel

from tori_core.config import get_settings

GOOGLE_METADATA_URL = "https://accounts.google.com/.well-known/openid-configuration"
SESSION_KEY = "identity"


@dataclass(frozen=True)
class Identity:
    sub: str
    email: str
    name: str | None = None
    picture: str | None = None


class DevLoginIn(BaseModel):
    email: str
    name: str | None = None


def get_identity(request: Request) -> Identity:
    """Dependency: trả về người đang đăng nhập, hoặc 401."""
    data = request.session.get(SESSION_KEY)
    if not data:
        raise HTTPException(status_code=401, detail="Chưa đăng nhập")
    return Identity(**data)


def _safe_next(next_url: str) -> str:
    # Chỉ cho phép đường dẫn nội bộ, tránh open redirect.
    return next_url if next_url.startswith("/") and not next_url.startswith("//") else "/"


def build_auth_router(on_login: Callable[[Identity], None] | None = None) -> APIRouter:
    settings = get_settings()
    router = APIRouter(prefix="/api/auth", tags=["auth"])
    oauth = OAuth()
    if settings.google_enabled:
        oauth.register(
            name="google",
            client_id=settings.google_client_id,
            client_secret=settings.google_client_secret,
            server_metadata_url=GOOGLE_METADATA_URL,
            client_kwargs={"scope": "openid email profile"},
        )

    def sign_in(request: Request, identity: Identity) -> None:
        if on_login:
            on_login(identity)
        request.session[SESSION_KEY] = asdict(identity)

    @router.get("/config")
    def auth_config() -> dict:
        return {"google": settings.google_enabled, "dev": settings.is_dev}

    @router.get("/login")
    async def login(request: Request, next: str = "/"):
        if not settings.google_enabled:
            raise HTTPException(status_code=404, detail="Chưa cấu hình Google OAuth")
        request.session["next"] = _safe_next(next)
        redirect_uri = str(request.url_for("auth_callback"))
        return await oauth.google.authorize_redirect(request, redirect_uri)

    @router.get("/callback", name="auth_callback")
    async def callback(request: Request):
        if not settings.google_enabled:
            raise HTTPException(status_code=404, detail="Chưa cấu hình Google OAuth")
        try:
            token = await oauth.google.authorize_access_token(request)
        except OAuthError:
            return RedirectResponse("/?login_error=1")
        info = token.get("userinfo") or {}
        if not info.get("sub") or not info.get("email_verified"):
            return RedirectResponse("/?login_error=1")
        sign_in(
            request,
            Identity(sub=info["sub"], email=info["email"], name=info.get("name"), picture=info.get("picture")),
        )
        return RedirectResponse(request.session.pop("next", "/"))

    @router.post("/dev-login")
    def dev_login(body: DevLoginIn, request: Request) -> dict:
        if not settings.is_dev:
            raise HTTPException(status_code=404)
        identity = Identity(sub=f"dev:{body.email}", email=body.email, name=body.name or body.email.split("@")[0])
        sign_in(request, identity)
        return asdict(identity)

    @router.post("/logout")
    def logout(request: Request) -> dict:
        request.session.clear()
        return {"ok": True}

    @router.get("/me")
    def me(request: Request) -> dict:
        return asdict(get_identity(request))

    return router
