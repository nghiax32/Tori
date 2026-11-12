from datetime import date

from calendar_app.holidays import holidays_on
from calendar_app.lunar import lunar_to_solar


def names(d: date) -> list[str]:
    return [h.name for h in holidays_on(d)]


def test_solar_holidays():
    assert names(date(2026, 9, 2)) == ["Quốc khánh"]
    assert holidays_on(date(2026, 9, 2))[0].off is True
    assert holidays_on(date(2026, 11, 20))[0].off is False  # Nhà giáo: không phải ngày nghỉ
    assert names(date(2026, 9, 3)) == []


def test_tet_and_new_year_eve_2026():
    assert names(date(2026, 2, 16)) == ["Giao thừa"]  # 29 tháng Chạp (tháng thiếu)
    assert names(date(2026, 2, 17)) == ["Tết Nguyên đán"]
    assert names(date(2026, 2, 19)) == ["Mùng 3 Tết"]


def test_lunar_holidays_follow_lunar_calendar():
    assert "Tết Trung thu" in names(lunar_to_solar(15, 8, 2026))
    assert "Giỗ Tổ Hùng Vương" in names(lunar_to_solar(10, 3, 2026))
    assert names(date(2025, 9, 6)) == ["Lễ Vu Lan"]


def test_leap_month_has_no_lunar_holiday():
    # 15/6 nhuận 2025: rằm nhưng không phải ngày lễ
    assert names(lunar_to_solar(15, 6, 2025, leap=True)) == []


def test_solar_and_lunar_on_same_day():
    # Tìm một ngày vừa là lễ dương vừa là lễ âm: phải trả về cả hai, dương trước âm sau
    d = date(2000, 1, 1)
    while not (len(found := holidays_on(d)) == 2 and found[0].calendar == "solar"):
        d = date.fromordinal(d.toordinal() + 1)
    assert [h.calendar for h in found] == ["solar", "lunar"]
