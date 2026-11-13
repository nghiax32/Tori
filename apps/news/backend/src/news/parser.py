"""Tách bản tin từ email "scheduled task completed" của Claude.

Email chỉ có phần HTML. Nội dung bản tin là markdown thô, chia thành các đoạn
<p style="...white-space:pre-line">; dòng đầu là tiêu đề, ví dụ
"⚡ Bản tin quốc tế buổi sáng — Thứ Sáu, 13/11/2026".
"""

import email
import re
import unicodedata
from dataclasses import dataclass
from datetime import date, datetime
from email import policy
from email.utils import parsedate_to_datetime
from html import unescape
from html.parser import HTMLParser
from zoneinfo import ZoneInfo

_DATE = re.compile(r"\b(\d{1,2})/(\d{1,2})/(\d{4})\b")
_SPACES = re.compile(r"\s+")


@dataclass(frozen=True)
class ParsedBulletin:
    edition: str  # morning | evening
    bulletin_date: date
    title: str
    body_md: str
    received_at: datetime


def normalize(text: str) -> str:
    """Chữ thường, bỏ dấu, đ -> d, gộp khoảng trắng: dùng để tìm kiếm không dấu."""
    s = text.replace("đ", "d").replace("Đ", "D")
    s = unicodedata.normalize("NFD", s)
    s = "".join(c for c in s if unicodedata.category(c) != "Mn")
    return _SPACES.sub(" ", s).strip().casefold()


class _PreLineParagraphs(HTMLParser):
    """Gom chữ của các thẻ <p> có white-space:pre-line (nơi chứa markdown của bản tin)."""

    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.paragraphs: list[str] = []
        self._buf: list[str] | None = None

    def handle_starttag(self, tag, attrs):
        if tag == "p":
            style = (dict(attrs).get("style") or "").replace(" ", "").lower()
            self._buf = [] if "white-space:pre-line" in style else None
        elif tag == "br" and self._buf is not None:
            self._buf.append("\n")

    def handle_endtag(self, tag):
        if tag == "p" and self._buf is not None:
            self.paragraphs.append("".join(self._buf).strip())
            self._buf = None

    def handle_data(self, data):
        if self._buf is not None:
            self._buf.append(data)


def extract_markdown(html: str) -> str:
    parser = _PreLineParagraphs()
    parser.feed(html)
    return "\n\n".join(p for p in parser.paragraphs if p)


def _edition(title: str, received_local: datetime) -> str:
    t = normalize(title)
    if "buoi toi" in t:
        return "evening"
    if "buoi sang" in t:
        return "morning"
    return "morning" if received_local.hour < 14 else "evening"


def _bulletin_date(title: str, received_local: datetime) -> date:
    m = _DATE.search(title)
    if m:
        try:
            return date(int(m.group(3)), int(m.group(2)), int(m.group(1)))
        except ValueError:
            pass
    return received_local.date()


def parse_message(raw: bytes, timezone: str) -> ParsedBulletin | None:
    """Email (dạng RFC 822) -> bản tin; None nếu email không chứa bản tin."""
    msg = email.message_from_bytes(raw, policy=policy.default)
    received_at = parsedate_to_datetime(msg["Date"]) if msg["Date"] else datetime.now(ZoneInfo("UTC"))
    received_local = received_at.astimezone(ZoneInfo(timezone))

    html_part = msg.get_body(("html",))
    if html_part is not None:
        markdown = extract_markdown(html_part.get_content())
    else:
        text_part = msg.get_body(("plain",))
        markdown = text_part.get_content().strip() if text_part is not None else ""
    if not markdown:
        return None

    first, _, rest = markdown.partition("\n")
    title = unescape(first).strip()
    if "ban tin" not in normalize(title):
        return None
    return ParsedBulletin(
        edition=_edition(title, received_local),
        bulletin_date=_bulletin_date(title, received_local),
        title=title,
        body_md=rest.strip(),
        received_at=received_at,
    )
