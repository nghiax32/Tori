"""Tính ngày của sự kiện thường niên trong từng năm. Không lưu gì vào DB."""

from calendar import isleap
from datetime import date, datetime
from zoneinfo import ZoneInfo

from tori_core import get_settings

from calendar_app.lunar import lunar_month_length, lunar_to_solar
from calendar_app.models import Event


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
    """Các (cycle_year, ngày dương) của sự kiện rơi vào năm dương `year`, bỏ các năm trước rule_year."""
    assert event.rule_month and event.rule_day
    if event.calendar == "solar":
        if event.rule_year and year < event.rule_year:
            return []
        return [(year, _solar_date(year, event.rule_month, event.rule_day))]
    # Ngày âm cuối năm (VD 20/12 âm) có thể rơi vào tháng 1-2 dương năm sau, nên xét cả năm âm year-1.
    result = []
    for lunar_year in (year - 1, year):
        if event.rule_year and lunar_year < event.rule_year:
            continue
        d = _lunar_date(lunar_year, event.rule_month, event.rule_day, event.rule_leap)
        if d.year == year:
            result.append((lunar_year, d))
    return result
