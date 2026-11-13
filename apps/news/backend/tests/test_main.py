from datetime import date, datetime, time
from email.message import EmailMessage
from html import escape
from zoneinfo import ZoneInfo

import httpx
import pytest
from news import sync
from news.db import SessionLocal
from news.gmail import GmailAuthError, GmailClient
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


def test_parse_evening_and_fallbacks():
    assert parse_message(make_email(EVENING), TZ).edition == "evening"
    # Tiêu đề không ghi buổi/ngày: lấy theo giờ nhận (20:05 giờ VN = tối, ngày 14/11)
    b = parse_message(make_email("Bản tin quốc tế\n\nNội dung", date="Sat, 14 Nov 2026 13:05:00 +0000"), TZ)
    assert (b.edition, b.bulletin_date) == ("evening", date(2026, 11, 14))


def test_parse_skips_other_mail():
    assert parse_message(make_email("Báo cáo tuần\n\nKhông phải bản tin"), TZ) is None


# ----- lưu vào DB -----


def test_import_dedupes_and_replaces_same_edition():
    source = FakeSource({"m1": make_email(MORNING), "e1": make_email(EVENING)})
    with SessionLocal() as s:
        assert sync.import_messages(s, source, "q") == 2
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
    assert source.queries[0].endswith("newer_than:1d")


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
    sync.run_sync(FakeSource({"m1": make_email(MORNING), "e1": make_email(EVENING), "x": make_email(script)}))

    items = client.get("/api/bulletins").json()
    # Mới nhất trước, trong ngày bản tối trước bản sáng
    assert [(i["bulletin_date"], i["edition"]) for i in items] == [
        ("2026-11-13", "evening"),
        ("2026-11-13", "morning"),
        ("2026-11-12", "morning"),
    ]
    # Tìm không dấu
    assert [i["edition"] for i in client.get("/api/bulletins", params={"q": "dau tang"}).json()] == ["morning"]

    morning = client.get(f"/api/bulletins/{items[1]['id']}").json()
    assert "<h2>Top 3 tin đáng chú ý</h2>" in morning["html"]
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
