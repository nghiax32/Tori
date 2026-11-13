from datetime import date, datetime

from sqlalchemy import (
    CheckConstraint,
    Column,
    ForeignKey,
    Index,
    String,
    Table,
    UniqueConstraint,
    false,
    func,
)
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship


class Base(DeclarativeBase):
    pass


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(primary_key=True)
    google_sub: Mapped[str] = mapped_column(unique=True)
    email: Mapped[str]
    name: Mapped[str | None]
    avatar_url: Mapped[str | None]
    created_at: Mapped[datetime] = mapped_column(server_default=func.current_timestamp())
    last_login_at: Mapped[datetime | None]


class Label(Base):
    """Nhãn của người dùng. Trùng tên (không phân biệt hoa/thường, dấu) là cùng một nhãn."""

    __tablename__ = "labels"
    __table_args__ = (UniqueConstraint("user_id", "name_norm"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    name: Mapped[str] = mapped_column(String(50))
    name_norm: Mapped[str] = mapped_column(String(50))


# Nhãn của sự kiện: gắn lúc tạo; lần mới của sự kiện chép nhãn từ đây
event_labels = Table(
    "event_labels",
    Base.metadata,
    Column("event_id", ForeignKey("events.id", ondelete="CASCADE"), primary_key=True),
    Column("label_id", ForeignKey("labels.id", ondelete="CASCADE"), primary_key=True),
)
# Nhãn riêng của từng lần (sự kiện không thường xuyên)
occurrence_labels = Table(
    "occurrence_labels",
    Base.metadata,
    Column("occurrence_id", ForeignKey("occurrences.id", ondelete="CASCADE"), primary_key=True),
    Column("label_id", ForeignKey("labels.id", ondelete="CASCADE"), primary_key=True),
)


class Event(Base):
    """Định nghĩa sự kiện. Sự kiện thường niên mang quy tắc lặp (calendar/rule_*) và không lưu lần
    xảy ra nào: ngày của từng năm được tính khi xem. rule_year là năm bắt đầu (theo lịch của quy tắc),
    để trống thì năm nào cũng hiện."""

    __tablename__ = "events"
    __table_args__ = (
        UniqueConstraint("user_id", "title_norm"),
        CheckConstraint("kind IN ('annual', 'occasional')", name="ck_events_kind"),
        CheckConstraint("calendar IS NULL OR calendar IN ('solar', 'lunar')", name="ck_events_calendar"),
        CheckConstraint("rule_month IS NULL OR rule_month BETWEEN 1 AND 12", name="ck_events_rule_month"),
        CheckConstraint("rule_day IS NULL OR rule_day BETWEEN 1 AND 31", name="ck_events_rule_day"),
        CheckConstraint(
            "(kind = 'annual' AND calendar IS NOT NULL AND rule_month IS NOT NULL AND rule_day IS NOT NULL)"
            " OR (kind = 'occasional' AND calendar IS NULL AND rule_month IS NULL AND rule_day IS NULL)",
            name="ck_events_rule_by_kind",
        ),
        Index("ix_events_user", "user_id"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    title: Mapped[str] = mapped_column(String(200))
    title_norm: Mapped[str] = mapped_column(String(200))
    kind: Mapped[str]
    note: Mapped[str | None]

    calendar: Mapped[str | None]
    rule_month: Mapped[int | None]
    rule_day: Mapped[int | None]
    rule_leap: Mapped[bool] = mapped_column(default=False)
    rule_year: Mapped[int | None]
    tracked: Mapped[bool] = mapped_column(default=False, server_default=false())  # hiện ở danh sách theo dõi

    created_at: Mapped[datetime] = mapped_column(server_default=func.current_timestamp())
    updated_at: Mapped[datetime] = mapped_column(
        server_default=func.current_timestamp(), onupdate=func.current_timestamp()
    )
    archived_at: Mapped[datetime | None]

    occurrences: Mapped[list["Occurrence"]] = relationship(
        back_populates="event", cascade="all, delete-orphan", passive_deletes=True
    )
    labels: Mapped[list[Label]] = relationship(secondary=event_labels, order_by=Label.name)


class Occurrence(Base):
    """Một lần xảy ra của sự kiện không thường xuyên, luôn là ngày dương lịch."""

    __tablename__ = "occurrences"
    __table_args__ = (
        CheckConstraint("end_date >= start_date", name="ck_occ_range"),
        Index("ix_occ_range", "start_date", "end_date"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    event_id: Mapped[int] = mapped_column(ForeignKey("events.id", ondelete="CASCADE"))
    start_date: Mapped[date]
    end_date: Mapped[date]
    note: Mapped[str | None]
    created_at: Mapped[datetime] = mapped_column(server_default=func.current_timestamp())
    updated_at: Mapped[datetime] = mapped_column(
        server_default=func.current_timestamp(), onupdate=func.current_timestamp()
    )

    event: Mapped[Event] = relationship(back_populates="occurrences")
    labels: Mapped[list[Label]] = relationship(secondary=occurrence_labels, order_by=Label.name)
