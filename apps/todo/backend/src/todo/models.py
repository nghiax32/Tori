from datetime import date, datetime

from sqlalchemy import ForeignKey, Index, String, func
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column


class Base(DeclarativeBase):
    pass


class User(Base):
    """Người dùng, nhận diện theo email đăng nhập."""

    __tablename__ = "users"

    id: Mapped[int] = mapped_column(primary_key=True)
    email: Mapped[str] = mapped_column(unique=True)
    name: Mapped[str | None]
    created_at: Mapped[datetime] = mapped_column(server_default=func.current_timestamp())
    last_login_at: Mapped[datetime | None]


class Task(Base):
    """Một việc cần làm của một người."""

    __tablename__ = "tasks"
    __table_args__ = (Index("ix_tasks_user", "user_id", "done"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    title: Mapped[str] = mapped_column(String(200))
    due: Mapped[date | None]  # hạn chót, không bắt buộc
    done: Mapped[bool] = mapped_column(default=False)
    created_at: Mapped[datetime]
    done_at: Mapped[datetime | None]
