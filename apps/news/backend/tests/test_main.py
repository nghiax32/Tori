from datetime import UTC, date, datetime, time
from email.message import EmailMessage
from html import escape
from zoneinfo import ZoneInfo

import httpx
import pytest
from news import sync
from news.db import SessionLocal
from news.gmail import GmailAuthError, GmailClient
from news.models import Bulletin
from news.parser import parse_message

TZ = "Asia/Ho_Chi_Minh"


def make_email(markdown: str, date: str = "Fri, 13 Nov 2026 01:15:22 +0000") -> bytes:
    """Email giống email "scheduled task completed" của Claude: chỉ có HTML, mỗi đoạn markdown
    là một <p style="white-space:pre-line">, kèm phần preheader ẩn và nút "Open session"."""
    paragraphs = "".join(
        f'<p style="margin:0 0 16px;white-space:pre-line">{escape(p)}</p>' for p in markdown.split("\n\n")
    )
    html = (
        '<html><body><div style="display:none;">preheader ẩn</div>'
        '<div style="font-size: 28px;">⚡ Bản tin — scheduled task completed</div>'
        f"<div>{paragraphs}</div>"
        '<p style="display: inline-block;"><a href="https://example.com/session">Open session</a></p>'
        "</body></html>"
    )
    msg = EmailMessage()
    msg["From"] = "no-reply-claude@mail.anthropic.com"
    msg["Subject"] = "⚡ Bản tin quốc tế buổi sáng — scheduled task completed"
    msg["Date"] = date
    msg.set_content(html, subtype="html")
    return msg.as_bytes()


MORNING = (
    "⚡ Bản tin quốc tế buổi sáng — Thứ Sáu, 13/11/2026\n🕗 Cập nhật lúc 08:12 (UTC+7)\n\n"
    "## Top 3 tin đáng chú ý\n\n"
    '**1. Dầu tăng mạnh.** Brent lên 95 USD, "không cần thỏa thuận". — [Reuters](https://www.reuters.com/x)\n\n'
    "**Sources:**\n- [Reuters – Dầu](https://www.reuters.com/x)"
)
EVENING = "⚡ Bản tin quốc tế buổi tối — Thứ Sáu, 13/11/2026\n\n## Thế giới\n\n**Đàm phán Ukraine.** Tin tối."
TECH = "⚡ Bản tin công nghệ — Thứ Sáu, 13/11/2026\n\n## 🛡️ Bảo mật\n\nTin công nghệ."


class FakeSource:
    """Thay Gmail trong test: id -> email."""

    def __init__(self, messages: dict[str, bytes]):
        self.messages = messages
        self.queries: list[str] = []

    def search(self, query: str, limit: int = 20) -> list[str]:
        self.queries.append(query)
        return list(self.messages)

    def raw(self, message_id: str) -> bytes:
        return self.messages[message_id]


# ----- tách email -----


def test_parse_morning():
    b = parse_message(make_email(MORNING), TZ)
    assert b is not None
    assert (b.edition, b.bulletin_date) == ("morning", date(2026, 11, 13))
    assert b.title == "⚡ Bản tin quốc tế buổi sáng — Thứ Sáu, 13/11/2026"
    assert b.body_md.startswith("🕗 Cập nhật")
    assert '"không cần thỏa thuận"' in b.body_md  # &#34; trong HTML -> dấu "
    assert "- [Reuters – Dầu](https://www.reuters.com/x)" in b.body_md  # giữ xuống dòng của danh sách
    assert "Open session" not in b.body_md and "preheader" not in b.body_md


def test_parse_current_title_skips_evening_and_fallbacks():
    b = parse_message(make_email("Bản tin thời sự — Thứ Ba, 17/11/2026\n\nTin."), TZ)
    assert (b.edition, b.bulletin_date) == ("morning", date(2026, 11, 17))
    assert parse_message(make_email(EVENING), TZ) is None  # bản tối đã bỏ: không lưu
    # Tiêu đề không ghi ngày: lấy ngày theo giờ nhận (20:05 giờ VN ngày 14/11)
    b = parse_message(make_email("Bản tin quốc tế\n\nNội dung", date="Sat, 14 Nov 2026 13:05:00 +0000"), TZ)
    assert (b.edition, b.bulletin_date) == ("morning", date(2026, 11, 14))


def test_parse_weekly_and_list_order(client):
    weekly = "⚡ Bản tin quốc tế tổng hợp tuần — 09/11 đến 15/11/2026\n\n## Tuần qua trong 5 điểm\n\nTin."
    b = parse_message(make_email(weekly, date="Sun, 15 Nov 2026 13:09:57 +0000"), TZ)
    assert (b.edition, b.bulletin_date) == ("weekly", date(2026, 11, 15))  # ngày cuối tuần

    news = "Bản tin thời sự — Chủ Nhật, 15/11/2026\n\nTin."
    source = FakeSource(
        {
            "w": make_email(weekly, date="Sun, 15 Nov 2026 11:01:57 +0000"),
            "m": make_email(news, date="Sat, 14 Nov 2026 23:05:24 +0000"),
        }
    )
    assert sync.run_sync(source).last_added == 2  # bản tuần không thay bản thời sự Chủ nhật
    assert [i["edition"] for i in client.get("/api/bulletins").json()] == ["weekly", "morning"]


def test_parse_tech_keeps_news(client):
    tech = "⚡ Bản tin công nghệ — Thứ Hai, 16/11/2026\n\n## 🛡️ Bảo mật\n\nTin."
    news = "Bản tin thời sự — Thứ Hai, 16/11/2026\n\nTin."
    b = parse_message(make_email(tech, date="Sun, 15 Nov 2026 23:31:00 +0000"), TZ)
    assert (b.edition, b.bulletin_date) == ("tech", date(2026, 11, 16))

    source = FakeSource(
        {
            "t": make_email(tech, date="Sun, 15 Nov 2026 23:36:00 +0000"),  # đến sau bản thời sự
            "m": make_email(news, date="Sun, 15 Nov 2026 23:05:00 +0000"),
        }
    )
    assert sync.run_sync(source).last_added == 2  # bản công nghệ không thay bản thời sự
    assert [i["edition"] for i in client.get("/api/bulletins").json()] == ["tech", "morning"]


def test_parse_skips_other_mail():
    assert parse_message(make_email("Báo cáo tuần\n\nKhông phải bản tin"), TZ) is None


# ----- lưu vào DB -----


def test_import_dedupes_and_replaces_same_edition():
    source = FakeSource({"m1": make_email(MORNING), "t1": make_email(TECH), "e1": make_email(EVENING)})
    with SessionLocal() as s:
        assert sync.import_messages(s, source, "q") == 2  # bản tối bị bỏ qua
        assert sync.import_messages(s, source, "q") == 0  # email đã lấy thì bỏ qua
        # Task chạy lại cùng buổi sáng: bản mới hơn thay bản cũ, bản cũ hơn thì bỏ
        newer = MORNING.replace("Dầu tăng mạnh", "Dầu tăng rất mạnh")
        older = MORNING.replace("Dầu tăng mạnh", "Bản cũ")
        source.messages = {
            "m2": make_email(newer, date="Fri, 13 Nov 2026 02:00:00 +0000"),
            "m0": make_email(older, date="Fri, 13 Nov 2026 00:30:00 +0000"),
        }
        assert sync.import_messages(s, source, "q") == 1
        s.commit()


def test_run_sync_records_status_and_adds_newer_than():
    source = FakeSource({"m1": make_email(MORNING)})
    state = sync.run_sync(source)
    assert (state.last_ok, state.last_added, state.last_error) == (True, 1, None)
    assert source.queries[0].endswith("newer_than:1d")  # chưa có bản tin nào: chỉ lấy 24 giờ qua


def test_run_sync_catches_up_missed_bulletins():
    # Lỡ các lần quét (server tắt): lần sau tìm từ bản tin đầu tiên đã lưu, lấy lại cả bản tin
    # cũ hơn bản mới nhất (VD: đã có thời sự 13 và 15, thiếu công nghệ 13)
    sync.run_sync(FakeSource({"m1": make_email(MORNING)}))  # nhận 01:15:22 UTC 13/11
    later = make_email("⚡ Bản tin quốc tế buổi sáng — 15/11/2026\n\nTin.", date="Sun, 15 Nov 2026 00:42:28 +0000")
    sync.run_sync(FakeSource({"m3": later}))
    source = FakeSource({"m3": later, "t1": make_email(TECH), "m1": make_email(MORNING)})
    assert sync.run_sync(source).last_added == 1  # chỉ công nghệ 13; m1, m3 đã có
    first = datetime(2026, 11, 13, 1, 15, 22, tzinfo=UTC)
    assert source.queries[0].endswith(f"after:{int(first.timestamp()) - 1}")


def test_run_sync_without_config_reports_error():
    state = sync.run_sync()
    assert state.last_ok is False and "Chưa cấu hình Gmail" in state.last_error


def test_gmail_invalid_grant_is_auth_error():
    transport = httpx.MockTransport(lambda req: httpx.Response(400, json={"error": "invalid_grant"}))
    gmail = GmailClient("id", "secret", "expired", http=httpx.Client(transport=transport))
    with pytest.raises(GmailAuthError):
        gmail.search("q")
    state = sync.run_sync(gmail)
    assert state.last_ok is False and "Mất quyền đọc Gmail" in state.last_error


def test_next_run():
    tz = ZoneInfo(TZ)
    times = [time(8), time(20)]
    assert sync.next_run(datetime(2026, 11, 13, 7, 59, tzinfo=tz), times) == datetime(2026, 11, 13, 8, tzinfo=tz)
    assert sync.next_run(datetime(2026, 11, 13, 8, 0, tzinfo=tz), times) == datetime(2026, 11, 13, 20, tzinfo=tz)
    assert sync.next_run(datetime(2026, 11, 13, 21, 0, tzinfo=tz), times) == datetime(2026, 11, 14, 8, tzinfo=tz)


# ----- API -----


def test_api_list_search_and_read(client):
    script = "⚡ Bản tin quốc tế buổi sáng — 12/11/2026\n\n<script>alert(1)</script> [x](javascript:alert(1))"
    sync.run_sync(FakeSource({"m1": make_email(MORNING), "t1": make_email(TECH), "x": make_email(script)}))
    with SessionLocal() as s:  # bản tối cũ còn trong DB: không liệt kê
        s.add(
            Bulletin(
                gmail_id="e0",
                edition="evening",
                bulletin_date=date(2026, 11, 13),
                title="Bản tin quốc tế buổi tối",
                body_md="Tin tối.",
                search_text="dau tang",
                received_at=datetime(2026, 11, 13, 13, tzinfo=UTC),
            )
        )
        s.commit()

    items = client.get("/api/bulletins").json()
    # Mới nhất trước, trong ngày bản công nghệ trước bản thời sự
    assert [(i["bulletin_date"], i["edition"]) for i in items] == [
        ("2026-11-13", "tech"),
        ("2026-11-13", "morning"),
        ("2026-11-12", "morning"),
    ]
    # Tìm không dấu
    assert [i["edition"] for i in client.get("/api/bulletins", params={"q": "dau tang"}).json()] == ["morning"]

    morning = client.get(f"/api/bulletins/{items[1]['id']}").json()
    assert "<h2>Top 3 tin đáng chú ý</h2>" in morning["html"]
    assert morning["structure"]["sections"][0]["kind"] == "top"  # bài đã tách mục cho trang dựng thẻ tin
    assert 'href="https://www.reuters.com/x" target="_blank" rel="noopener noreferrer"' in morning["html"]

    unsafe = client.get(f"/api/bulletins/{items[2]['id']}").json()["html"]
    assert "<script>" not in unsafe and 'href="javascript' not in unsafe  # chỉ còn là chữ, không thành thẻ/link


def test_api_owner_only(client, monkeypatch):
    assert client.get("/api/status").status_code == 200  # dev, chưa đặt NEWS_OWNER_EMAILS: ai đăng nhập cũng xem được
    monkeypatch.setenv("NEWS_OWNER_EMAILS", "someone@example.com")
    from news.config import get_news_settings

    get_news_settings.cache_clear()
    assert client.get("/api/bulletins").status_code == 403
    monkeypatch.setenv("NEWS_OWNER_EMAILS", "Someone@example.com, OWNER@example.com")
    get_news_settings.cache_clear()
    assert client.get("/api/bulletins").status_code == 200


def test_api_requires_login():
    from fastapi.testclient import TestClient
    from news.main import app

    with TestClient(app) as c:
        assert c.get("/api/bulletins").status_code == 401
