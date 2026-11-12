from datetime import date

from calendar_app.generator import _lunar_date, annual_dates
from calendar_app.lunar import lunar_month_length, lunar_to_solar
from calendar_app.models import Event
from calendar_app.text import normalize_title


def _annual(calendar, month, day, leap=False, year=None):
    return Event(kind="annual", calendar=calendar, rule_month=month, rule_day=day, rule_leap=leap, rule_year=year)


def test_solar_birthday():
    assert annual_dates(_annual("solar", 3, 15), 2027) == [(2027, date(2027, 3, 15))]


def test_feb_29_falls_back_to_feb_28():
    assert annual_dates(_annual("solar", 2, 29), 2027) == [(2027, date(2027, 2, 28))]
    assert annual_dates(_annual("solar", 2, 29), 2028) == [(2028, date(2028, 2, 29))]


def test_lunar_mid_year():
    assert annual_dates(_annual("lunar", 7, 15), 2025) == [(2025, date(2025, 9, 6))]


def test_lunar_late_month_lands_in_next_solar_year():
    # 20/12 âm năm 2025 rơi vào tháng 2/2026 -> thuộc năm dương 2026, cycle_year = 2025
    result = annual_dates(_annual("lunar", 12, 20), 2026)
    assert result == [(2025, lunar_to_solar(20, 12, 2025))]
    assert result[0][1].year == 2026


def test_leap_rule_uses_regular_month_when_year_has_no_leap():
    assert annual_dates(_annual("lunar", 6, 10, leap=True), 2026) == [(2026, lunar_to_solar(10, 6, 2026))]
    assert annual_dates(_annual("lunar", 6, 10, leap=True), 2025) == [(2025, lunar_to_solar(10, 6, 2025, True))]


def test_day_30_in_short_month_uses_29():
    year = 2026
    month = next(m for m in range(1, 13) if lunar_month_length(m, year) == 29)
    assert _lunar_date(year, month, 30, False) == lunar_to_solar(29, month, year)


def test_rule_year_hides_earlier_years():
    assert annual_dates(_annual("solar", 3, 15, year=2027), 2026) == []
    assert annual_dates(_annual("solar", 3, 15, year=2027), 2027) == [(2027, date(2027, 3, 15))]
    # rule_year âm lịch: 20/12 âm 2025 (rơi vào 2026 dương) là lần đầu
    assert annual_dates(_annual("lunar", 12, 20, year=2025), 2025) == []
    assert [y for y, _ in annual_dates(_annual("lunar", 12, 20, year=2025), 2026)] == [2025]


def test_normalize_title():
    assert normalize_title("  Thay  Dầu xe ") == "thay dau xe"
    assert normalize_title("ĐI ĐÀ LẠT") == "di da lat"
