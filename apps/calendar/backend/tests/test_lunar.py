from datetime import date, timedelta

import pytest

from calendar_app.lunar import LunarDate, lunar_month_length, lunar_to_solar, solar_to_lunar


@pytest.mark.parametrize(
    ("lunar_year", "tet"),
    [
        (1985, date(1985, 1, 21)),  # Việt Nam khác Trung Quốc (20/02/1985)
        (2024, date(2024, 2, 10)),
        (2025, date(2025, 1, 29)),
        (2026, date(2026, 2, 17)),
    ],
)
def test_tet(lunar_year, tet):
    assert lunar_to_solar(1, 1, lunar_year) == tet
    assert solar_to_lunar(tet) == LunarDate(1, 1, lunar_year, False)


def test_leap_month_2025_is_month_6():
    assert lunar_to_solar(1, 6, 2025) == date(2025, 6, 25)
    assert lunar_to_solar(1, 6, 2025, leap=True) == date(2025, 7, 25)
    assert solar_to_lunar(date(2025, 7, 25)) == LunarDate(1, 6, 2025, True)


def test_leap_month_2023_is_month_2():
    assert lunar_to_solar(1, 2, 2023, leap=True) == date(2023, 3, 22)


def test_missing_leap_month_returns_none():
    assert lunar_to_solar(1, 6, 2026, leap=True) is None
    assert lunar_month_length(6, 2026, leap=True) is None


def test_vu_lan_2025():
    assert lunar_to_solar(15, 7, 2025) == date(2025, 9, 6)


def test_round_trip_2000_2035():
    d = date(2000, 1, 1)
    while d < date(2036, 1, 1):
        ld = solar_to_lunar(d)
        assert lunar_to_solar(ld.day, ld.month, ld.year, ld.leap) == d, d
        assert 1 <= ld.day <= 30
        d += timedelta(days=1)


def test_month_length_is_29_or_30():
    lengths = {lunar_month_length(m, 2026) for m in range(1, 13)}
    assert lengths == {29, 30}
