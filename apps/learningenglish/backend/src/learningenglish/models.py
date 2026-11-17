from datetime import date, datetime

from sqlalchemy import JSON, ForeignKey, Index, String, func
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column


class Base(DeclarativeBase):
    pass


class User(Base):
    """Người học, nhận diện theo email đăng nhập."""

    __tablename__ = "users"

    id: Mapped[int] = mapped_column(primary_key=True)
    email: Mapped[str] = mapped_column(unique=True)
    name: Mapped[str | None]
    created_at: Mapped[datetime] = mapped_column(server_default=func.current_timestamp())
    last_login_at: Mapped[datetime | None]


class EnglishWord(Base):
    """Từ trong kho từ dùng chung (nạp từ words.py và examples.py khi khởi động)."""

    __tablename__ = "english_words"

    id: Mapped[int] = mapped_column(primary_key=True)
    word: Mapped[str] = mapped_column(String(60), unique=True)
    ipa: Mapped[str] = mapped_column(String(80), default="")  # phiên âm, VD "/əˈtʃiːv/"
    meaning: Mapped[str] = mapped_column(String(120))
    example: Mapped[str] = mapped_column(String(200), default="")  # câu ví dụ cho chế độ Điền vào câu
    example_vi: Mapped[str] = mapped_column(String(250), default="")  # bản dịch tiếng Việt của câu ví dụ
    topic: Mapped[str] = mapped_column(String(20), default="")  # mã chủ đề trong topics.py
    level: Mapped[str] = mapped_column(String(2), default="B1")  # trình độ A2 / B1 / B2 (levels.py)


class EnglishProgress(Base):
    """Tiến độ học một từ của một người (lịch ôn ngắt quãng kiểu SM-2)."""

    __tablename__ = "english_progress"
    __table_args__ = (Index("ix_english_due", "user_id", "due"),)

    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)
    word_id: Mapped[int] = mapped_column(ForeignKey("english_words.id", ondelete="CASCADE"), primary_key=True)
    reps: Mapped[int] = mapped_column(default=0)  # số lần đúng liên tiếp
    ease: Mapped[float] = mapped_column(default=2.5)
    interval: Mapped[int] = mapped_column(default=0)  # số ngày đến lần ôn sau
    due: Mapped[date]
    correct: Mapped[int] = mapped_column(default=0)
    wrong: Mapped[int] = mapped_column(default=0)
    last_seen: Mapped[datetime]


class EnglishRound(Base):
    """Một lượt luyện tập: Ghép cặp (match), Nghe – chép (listen) hoặc Điền vào câu (fill).
    Lượt Ghép cặp xong thì `total_ms` (thời gian + phạt) được tính vào bảng xếp hạng."""

    __tablename__ = "english_rounds"
    __table_args__ = (
        Index("ix_english_round_user", "user_id", "finished_at"),
        {"sqlite_autoincrement": True},
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    mode: Mapped[str] = mapped_column(String(10), default="match")
    word_ids: Mapped[list[int]] = mapped_column(JSON)
    started_at: Mapped[datetime]
    finished_at: Mapped[datetime | None]
    elapsed_ms: Mapped[int | None]
    mistakes: Mapped[int | None]
    total_ms: Mapped[int | None]


class EnglishDailyAnswer(Base):
    """Từ của một ngày (chọn lần đầu có người mở trong ngày, sau đó cố định)."""

    __tablename__ = "english_daily_answers"

    day: Mapped[date] = mapped_column(primary_key=True)
    word: Mapped[str] = mapped_column(String(5))
    ipa: Mapped[str] = mapped_column(String(80))
    meaning: Mapped[str] = mapped_column(String(120))


class EnglishDaily(Base):
    """Lượt đoán Từ của ngày của một người."""

    __tablename__ = "english_daily"

    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)
    day: Mapped[date] = mapped_column(primary_key=True)
    guesses: Mapped[list[str]] = mapped_column(JSON, default=list)
    solved: Mapped[bool] = mapped_column(default=False)
    first_guess_at: Mapped[datetime | None]
    finished_at: Mapped[datetime | None]
    seconds: Mapped[int | None]  # từ lượt đoán đầu đến lúc đoán đúng
