from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

DEV_SECRET = "dev-insecure-secret-change-me"


class Settings(BaseSettings):
    """Cấu hình đọc từ biến môi trường (hoặc file .env ở thư mục đang chạy)."""

    # env_ignore_empty: dòng "PUBLIC_PORT=" (rỗng) trong .env = dùng giá trị mặc định
    model_config = SettingsConfigDict(env_file=".env", extra="ignore", env_ignore_empty=True)

    tori_env: str = "dev"  # dev | prod
    tori_domain: str = "localhost"
    tori_scheme: str = "http"
    public_port: int | None = None

    secret_key: str = DEV_SECRET
    google_client_id: str = ""
    google_client_secret: str = ""

    data_dir: Path = Path("data")
    static_dir: Path | None = None
    timezone: str = "Asia/Ho_Chi_Minh"

    @property
    def is_dev(self) -> bool:
        return self.tori_env == "dev"

    @property
    def google_enabled(self) -> bool:
        return bool(self.google_client_id and self.google_client_secret)

    def app_url(self, subdomain: str = "") -> str:
        """URL công khai của một app; subdomain rỗng = trang hub."""
        host = f"{subdomain}.{self.tori_domain}" if subdomain else self.tori_domain
        port = f":{self.public_port}" if self.public_port else ""
        return f"{self.tori_scheme}://{host}{port}"


@lru_cache
def get_settings() -> Settings:
    settings = Settings()
    if not settings.is_dev and settings.secret_key == DEV_SECRET:
        raise RuntimeError("TORI_ENV=prod nhưng SECRET_KEY vẫn là giá trị mặc định. Hãy đặt SECRET_KEY.")
    return settings
