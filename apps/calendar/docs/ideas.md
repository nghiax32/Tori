# Ý tưởng chưa làm

## Chế độ xem "string" (CHƯA THỐNG NHẤT)

> Trạng thái: chỉ là ghi chú ý tưởng, còn mơ hồ, chưa chốt thiết kế. Không làm cho tới khi thống nhất.

Ý tưởng gốc:

- Trục x thể hiện 15 ngày trước và 15 ngày sau hôm nay.
- Vẽ "string" (sợi chỉ) tới những sự kiện được đánh dấu là **theo dõi**.
- Sự kiện cách hôm nay **quá 15 ngày** (trước hoặc sau): sợi chạy ra mép, **không có điểm cuối**.
- Sự kiện trong vòng **15 ngày**: sợi nối tới đúng ngày đó và hiển thị ngày chính xác trên trục.

Cách hiểu đã đề xuất (chưa được duyệt):

- Mỗi sự kiện theo dõi = một sợi, xuất phát từ "hôm nay", nối tới lần xảy ra **gần hôm nay nhất** (quá khứ hoặc tương lai).
- Nhãn: "20/11 · còn 8 ngày", "05/11 · 7 ngày trước"; sợi ra mép: "→ còn 42 ngày".
- Sự kiện có khoảng ngày: sợi nối tới một đoạn trên trục.

Câu hỏi còn mở:

- Với sự kiện thường niên: trỏ tới lần gần nhất hay luôn trỏ tới lần **sắp tới**?
- Với sự kiện không thường xuyên (VD đi du lịch): ý nghĩa chính là "đã bao lâu kể từ lần cuối"?

Ảnh hưởng tới DB khi làm: thêm cột `events.tracked BOOLEAN NOT NULL DEFAULT 0`.

## Khác

- Gộp hai sự kiện bị tạo trùng (VD "Đi du lịch" và "Du lịch").
- Form sửa quy tắc lặp của sự kiện thường niên (API `PATCH /api/events/{id}` đã hỗ trợ, UI chưa có).
- Hiển thị ngày âm lịch nhỏ trong từng ô của calendar.
