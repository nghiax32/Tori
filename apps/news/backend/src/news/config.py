from datetime import time
from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict

# Bản tin do Claude gửi (scheduled task) có tiêu đề "Bản tin thời sự — ...", "Bản tin công nghệ — ..."
DEFAULT_QUERY = 'from:no-reply-claude@mail.anthropic.com subject:"Bản tin"'


class NewsSettings(BaseSettings):
    """Cấu hình riêng của app Bản tin, đọc từ biến môi trường / .env (xem .env.example)."""

    model_config = SettingsConfigDict(env_file=".env", extra="ignore", env_ignore_empty=True)

    # Lấy bằng scripts/gmail_auth.py
    gmail_client_id: str = ""
    gmail_client_secret: str = ""
    gmail_refresh_token: str = ""

    # Bộ lọc tìm email trong Gmail (cú pháp ô tìm kiếm của Gmail); mỗi lần quét thêm
    # "after:<giờ nhận bản tin đầu tiên>" (chưa có bản tin nào: "newer_than:1d")
    news_gmail_query: str = DEFAULT_QUERY
    # Giờ quét mỗi ngày (giờ TIMEZONE), cách nhau bằng dấu phẩy
    news_fetch_times: str = "06:50,08:15,18:30"
    # Email được xem bản tin, cách nhau bằng dấu phẩy. Bỏ trống: ở dev ai đăng nhập cũng xem được,
    # ở prod không ai xem được (bản tin lấy từ hộp thư riêng, không mở cho mọi người).
    news_owner_emails: str = ""

    @property
    def gmail_configured(self) -> bool:
        return bool(self.gmail_client_id and self.gmail_client_secret and self.gmail_refresh_token)

    @property
    def fetch_times(self) -> list[time]:
        return sorted(time.fromisoformat(t.strip()) for t in self.news_fetch_times.split(",") if t.strip())

    @property
    def owner_emails(self) -> set[str]:
        return {e.strip().lower() for e in self.news_owner_emails.split(",") if e.strip()}


@lru_cache
def get_news_settings() -> NewsSettings:
    return NewsSettings()
