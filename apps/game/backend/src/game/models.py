from datetime import datetime

from sqlalchemy import JSON, CheckConstraint, ForeignKey, Index, String, func
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column


class Base(DeclarativeBase):
    pass


class User(Base):
    """Người chơi, nhận diện theo email đăng nhập."""

    __tablename__ = "users"

    id: Mapped[int] = mapped_column(primary_key=True)
    email: Mapped[str] = mapped_column(unique=True)
    name: Mapped[str | None]
    created_at: Mapped[datetime] = mapped_column(server_default=func.current_timestamp())
    last_login_at: Mapped[datetime | None]


class SudokuGame(Base):
    """Một ván Sudoku. Chưa xong (finished_at trống) là ván đang chơi dở; xong thì `seconds` là thời gian giải."""

    __tablename__ = "sudoku_games"
    __table_args__ = (
        CheckConstraint("level IN ('easy', 'medium', 'hard')", name="ck_sudoku_level"),
        Index("ix_sudoku_user", "user_id", "finished_at"),
        Index("ix_sudoku_board", "level", "seconds"),
        # Không dùng lại id của ván đã xoá: trang còn mở ván cũ không ghi nhầm sang ván mới
        {"sqlite_autoincrement": True},
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    level: Mapped[str] = mapped_column(String(10))
    puzzle: Mapped[str] = mapped_column(String(81))
    solution: Mapped[str] = mapped_column(String(81))
    board: Mapped[str] = mapped_column(String(81))
    # Ghi chú (số nháp) của 81 ô, mỗi ô một bitmask: bit d = có ghi số d
    notes: Mapped[list[int]] = mapped_column(JSON)
    # Thời gian đã chơi (giây) do trình duyệt đếm, chỉ tính lúc trang đang mở
    elapsed: Mapped[int] = mapped_column(default=0)
    started_at: Mapped[datetime]
    finished_at: Mapped[datetime | None]
    seconds: Mapped[int | None]
