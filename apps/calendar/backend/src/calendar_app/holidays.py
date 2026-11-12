"""Ngày lễ cố định của Việt Nam (dương lịch và âm lịch), không phụ thuộc người dùng.

`off=True`: ngày nghỉ lễ theo Bộ luật Lao động 2019 (Điều 112). Các ngày nghỉ thêm/nghỉ bù do
Chính phủ công bố từng năm (VD số ngày nghỉ Tết, ngày nghỉ kèm Quốc khánh) không có ở đây.
"""

from dataclasses import dataclass
from datetime import date, timedelta

from calendar_app.lunar import LunarDate, solar_to_lunar


@dataclass(frozen=True)
class Holiday:
    name: str
    calendar: str  # "solar" | "lunar"
    off: bool = False


# (ngày, tháng) dương lịch
SOLAR_HOLIDAYS: dict[tuple[int, int], Holiday] = {
    (1, 1): Holiday("Tết Dương lịch", "solar", off=True),
    (3, 2): Holiday("Thành lập Đảng CSVN", "solar"),
    (8, 3): Holiday("Quốc tế Phụ nữ", "solar"),
    (26, 3): Holiday("Thành lập Đoàn TNCS HCM", "solar"),
    (30, 4): Holiday("Giải phóng miền Nam", "solar", off=True),
    (1, 5): Holiday("Quốc tế Lao động", "solar", off=True),
    (19, 5): Holiday("Ngày sinh Chủ tịch Hồ Chí Minh", "solar"),
    (1, 6): Holiday("Quốc tế Thiếu nhi", "solar"),
    (28, 6): Holiday("Ngày Gia đình Việt Nam", "solar"),
    (27, 7): Holiday("Thương binh Liệt sĩ", "solar"),
    (2, 9): Holiday("Quốc khánh", "solar", off=True),
    (20, 10): Holiday("Phụ nữ Việt Nam", "solar"),
    (20, 11): Holiday("Nhà giáo Việt Nam", "solar"),
    (22, 12): Holiday("Quân đội Nhân dân Việt Nam", "solar"),
    (25, 12): Holiday("Giáng sinh", "solar"),
}

# (ngày, tháng) âm lịch, chỉ áp dụng cho tháng thường (không nhuận)
LUNAR_HOLIDAYS: dict[tuple[int, int], Holiday] = {
    (1, 1): Holiday("Tết Nguyên đán", "lunar", off=True),
    (2, 1): Holiday("Mùng 2 Tết", "lunar", off=True),
    (3, 1): Holiday("Mùng 3 Tết", "lunar", off=True),
    (15, 1): Holiday("Tết Nguyên tiêu", "lunar"),
    (3, 3): Holiday("Tết Hàn thực", "lunar"),
    (10, 3): Holiday("Giỗ Tổ Hùng Vương", "lunar", off=True),
    (15, 4): Holiday("Lễ Phật đản", "lunar"),
    (5, 5): Holiday("Tết Đoan ngọ", "lunar"),
    (15, 7): Holiday("Lễ Vu Lan", "lunar"),
    (15, 8): Holiday("Tết Trung thu", "lunar"),
    (23, 12): Holiday("Ông Công Ông Táo", "lunar"),
}

NEW_YEAR_EVE = Holiday("Giao thừa", "lunar")


def holidays_on(d: date, lunar: LunarDate | None = None) -> list[Holiday]:
    """Các ngày lễ rơi vào ngày dương `d` (truyền sẵn `lunar` nếu đã tính để đỡ tính lại)."""
    lunar = lunar or solar_to_lunar(d)
    result = []
    if solar := SOLAR_HOLIDAYS.get((d.day, d.month)):
        result.append(solar)
    if not lunar.leap and (lh := LUNAR_HOLIDAYS.get((lunar.day, lunar.month))):
        result.append(lh)
    if lunar.month == 12 and not lunar.leap:
        # Giao thừa = ngày cuối tháng Chạp (29 hoặc 30), tức hôm trước mùng 1 Tết
        tomorrow = solar_to_lunar(d + timedelta(days=1))
        if (tomorrow.day, tomorrow.month, tomorrow.leap) == (1, 1, False):
            result.append(NEW_YEAR_EVE)
    return result
