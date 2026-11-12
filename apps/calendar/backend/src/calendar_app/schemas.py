from datetime import date
from typing import Literal

from pydantic import BaseModel, Field

Kind = Literal["annual", "occasional"]
CalendarKind = Literal["solar", "lunar"]


class RuleIn(BaseModel):
    """Quy tắc lặp của sự kiện thường niên: ngày/tháng theo lịch `calendar` (âm lịch thì nhập thẳng
    ngày âm), và năm bắt đầu không bắt buộc (năm âm lịch nếu calendar='lunar')."""

    calendar: CalendarKind | None = None
    rule_month: int | None = Field(default=None, ge=1, le=12)
    rule_day: int | None = Field(default=None, ge=1, le=31)
    rule_leap: bool = False
    rule_year: int | None = Field(default=None, ge=1800, le=2199)


class EventCreate(RuleIn):
    title: str = Field(min_length=1, max_length=200)
    kind: Kind
    category: str | None = Field(default=None, max_length=50)
    note: str | None = None
    # Lần xảy ra đầu tiên, chỉ dùng cho sự kiện không thường xuyên
    start_date: date | None = None
    end_date: date | None = None
    occurrence_note: str | None = None


class EventUpdate(RuleIn):
    title: str | None = Field(default=None, min_length=1, max_length=200)
    category: str | None = Field(default=None, max_length=50)
    note: str | None = None
    archived: bool | None = None


class OccurrenceCreate(BaseModel):
    start_date: date
    end_date: date | None = None
    note: str | None = None


class OccurrenceUpdate(BaseModel):
    start_date: date | None = None
    end_date: date | None = None
    note: str | None = None


class EventOut(BaseModel):
    id: int
    title: str
    kind: Kind
    category: str | None
    note: str | None
    calendar: CalendarKind | None
    rule_month: int | None
    rule_day: int | None
    rule_leap: bool
    rule_year: int | None
    archived: bool
    occurrence_count: int
    last_date: date | None
    lunar_label: str | None


class OccurrenceOut(BaseModel):
    id: int | None  # None: lần của sự kiện thường niên, tính từ quy tắc chứ không lưu trong DB
    event_id: int
    title: str
    kind: Kind
    category: str | None
    start_date: date
    end_date: date
    note: str | None
    lunar_label: str | None


class CreateResult(BaseModel):
    event: EventOut
    occurrence: OccurrenceOut | None
    reused: bool = False


class HolidayOut(BaseModel):
    name: str
    calendar: CalendarKind
    off: bool  # ngày nghỉ lễ theo Bộ luật Lao động


class LunarDayOut(BaseModel):
    date: date
    day: int
    month: int
    year: int
    leap: bool
    full_moon: bool  # rằm (15 âm)
    holidays: list[HolidayOut]
