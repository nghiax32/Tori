"""Sinh các lần xảy ra (occurrences) cho sự kiện thường niên.

Chạy được nhiều lần mà không sinh trùng nhờ UNIQUE(event_id, cycle_year). App gọi hàm này
mỗi ngày (và khi khởi động), nên nếu server tắt đúng hôm 1/1 thì hôm sau vẫn sinh bù.
"""

from calendar import isleap
from datetime import date, datetime
from zoneinfo import ZoneInfo

from sqlalchemy import delete, select
from sqlalchemy.orm import Session
from tori_core import get_settings

from calendar_app.lunar import lunar_month_length, lunar_to_solar
from calendar_app.models import Event, Occurrence


def today() -> date:
    return datetime.now(ZoneInfo(get_settings().timezone)).date()


def _solar_date(year: int, month: int, day: int) -> date:
    if month == 2 and day == 29 and not isleap(year):
        day = 28  # sinh nhật 29/2 vào năm không nhuận
    return date(year, month, day)


def _lunar_date(lunar_year: int, month: int, day: int, leap: bool) -> date:
    if leap and lunar_to_solar(1, month, lunar_year, True) is None:
        leap = False  # năm nay không nhuận tháng này -> dùng tháng thường
    length = lunar_month_length(month, lunar_year, leap) or 29
    solar = lunar_to_solar(min(day, length), month, lunar_year, leap)  # ngày 30 vào tháng thiếu -> 29
    assert solar is not None
    return solar


def annual_dates(event: Event, year: int) -> list[tuple[int, date]]:
    """Các (cycle_year, ngày dương) của sự kiện rơi vào năm dương `year`."""
    assert event.rule_month and event.rule_day
    if event.calendar == "solar":
        return [(year, _solar_date(year, event.rule_month, event.rule_day))]
    # Ngày âm cuối năm (VD 20/12 âm) có thể rơi vào tháng 1-2 dương năm sau, nên xét cả năm âm year-1.
    result = []
    for lunar_year in (year - 1, year):
        d = _lunar_date(lunar_year, event.rule_month, event.rule_day, event.rule_leap)
        if d.year == year:
            result.append((lunar_year, d))
    return result


def generate_for_year(session: Session, year: int, events: list[Event] | None = None) -> int:
    """Tạo occurrence còn thiếu của năm `year`. Trả về số dòng đã tạo (chưa commit)."""
    if events is None:
        events = list(
            session.scalars(select(Event).where(Event.kind == "annual", Event.archived_at.is_(None)))
        )
    events = [e for e in events if e.kind == "annual" and e.archived_at is None]
    if not events:
        return 0
    rows = session.execute(
        select(Occurrence.event_id, Occurrence.cycle_year).where(
            Occurrence.event_id.in_([e.id for e in events]), Occurrence.cycle_year.is_not(None)
        )
    )
    existing = {(event_id, cycle_year) for event_id, cycle_year in rows}
    created = 0
    for event in events:
        for cycle_year, d in annual_dates(event, year):
            if (event.id, cycle_year) in existing:
                continue
            if event.origin_date and d < event.origin_date:
                continue  # chưa tới ngày gốc (VD năm trước năm sinh)
            session.add(
                Occurrence(
                    event_id=event.id,
                    start_date=d,
                    end_date=d,
                    cycle_year=cycle_year,
                    created_by="generator",
                )
            )
            existing.add((event.id, cycle_year))
            created += 1
    session.flush()
    return created


def regenerate_from_this_year(session: Session, event: Event, on: date) -> None:
    """Sau khi đổi quy tắc: tính lại các lần từ năm nay, giữ nguyên lần đã sửa tay và các năm cũ."""
    session.execute(
        delete(Occurrence).where(
            Occurrence.event_id == event.id,
            Occurrence.start_date >= date(on.year, 1, 1),
            Occurrence.is_customized.is_(False),
            Occurrence.created_by == "generator",
        )
    )
    session.flush()
    session.expire(event, ["occurrences"])
    generate_for_year(session, on.year, [event])
