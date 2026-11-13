from datetime import date, datetime

from sqlalchemy import Date, DateTime, Integer, String, Text, UniqueConstraint, func
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column


class Base(DeclarativeBase):
    pass


class Bulletin(Base):
    """Một bản tin (sáng hoặc tối của một ngày), lấy từ một email trong Gmail."""

    __tablename__ = "bulletins"
    # Một ngày chỉ một bản sáng, một bản tối: nếu task chạy lại thì bản mới thay bản cũ
    __table_args__ = (UniqueConstraint("bulletin_date", "edition"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    gmail_id: Mapped[str] = mapped_column(String(64), unique=True)
    edition: Mapped[str] = mapped_column(String(10))  # morning | evening
    bulletin_date: Mapped[date] = mapped_column(Date, index=True)
    title: Mapped[str] = mapped_column(String(300))
    body_md: Mapped[str] = mapped_column(Text)
    search_text: Mapped[str] = mapped_column(Text)  # tiêu đề + nội dung, chữ thường, bỏ dấu
    received_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class SyncState(Base):
    """Kết quả lần quét Gmail gần nhất (một dòng duy nhất, id = 1)."""

    __tablename__ = "sync_state"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    last_run_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    last_ok: Mapped[bool] = mapped_column(default=False)
    last_error: Mapped[str | None] = mapped_column(Text)
    last_added: Mapped[int] = mapped_column(Integer, default=0)
