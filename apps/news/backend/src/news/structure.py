"""Tách markdown bản tin thành các mục và các tin để trang dựng giao diện dễ đọc.

Khuôn bản tin (do scheduled task của Claude viết):
- dòng đầu "🕗 Cập nhật lúc ...";
- các mục "## <emoji> Tên mục";
- tin nổi bật: "**1. Tiêu đề.** nội dung";
- tin thường: "**Tiêu đề** — tóm tắt [Nguồn](url) · [Nguồn](url)" hoặc "**Tiêu đề.** tóm tắt — [Nguồn](url)";
  bản tuần thì sau "—" là ngày, xuống dòng rồi mới đến nội dung;
- lịch sắp tới: danh sách "- **mốc thời gian:** nội dung";
- danh sách nguồn: "Sources:" (hoặc mục "## Sources:") rồi danh sách link.

Khuôn do AI viết nên có thể lệch: đoạn nào không khớp vẫn giữ nguyên dạng HTML, không mất nội dung.
Không có mục "##" nào thì trả None để trang hiện bài như cũ.
"""

import re
from typing import Any

from news.parser import normalize
from news.render import inline_html, to_html

_ICON = re.compile(r"^([^\w\s(\[]+)\s+(.+)$")  # "🌍 Thế giới" -> ("🌍", "Thế giới")
_TOP = re.compile(r"^\*\*(\d+)\.\s+(.+?)\*\*\s*(.*)$", re.DOTALL)
_ITEM = re.compile(r"^\*\*(.+?)\*\*\s*(?:([—–-])\s+)?(.*)$", re.DOTALL)
_LINK = re.compile(r"\[([^\]]+)\]\(([^)\s]+)\)")
_TRAILING_LINKS = re.compile(r"(?:\s*(?:[·—–]\s*)?\[[^\]]+\]\([^)\s]+\))+\s*$")
_TIMELINE_ENTRY = re.compile(r"^-\s+\*\*(.+?)\*\*\s*(.*)$")
_SOURCES_LABEL = re.compile(r"^(sources|nguon|nguon tham khao)\s*:?$")
_INLINE_SOURCES = re.compile(r"^(?:Nguồn|Sources)\s*:\s*((?:\s*(?:·\s*)?\[[^\]]+\]\([^)\s]+\))+)\s*$")

_TONES = (
    ("world", ("the gioi",)),
    ("economy", ("kinh te",)),
    ("tech", ("cong nghe",)),
    ("asia", ("chau a", "viet nam")),
    ("science", ("khoa hoc", "suc khoe", "khi hau", "khac")),
    ("security", ("bao mat",)),
    ("dev", ("lap trinh", "ma nguon mo")),
)


def refang(text: str) -> str:
    """Link bị viết kiểu "https[://]www[.]a[.]com" (để email không tự tạo link) -> link thường."""
    return text.replace("[://]", "://").replace("[.]", ".")


def _links(text: str) -> list[dict[str, str]]:
    """Các link http(s) trong đoạn markdown -> [{name, url}]; link khác (javascript:...) bỏ qua."""
    return [
        {"name": name.strip(), "url": url}
        for name, url in _LINK.findall(text)
        if url.startswith(("https://", "http://"))
    ]


def _split_sources(body: str) -> tuple[str, list[dict[str, str]]]:
    """Tách chuỗi link nguồn ở cuối đoạn: ("nội dung", [nguồn...])."""
    m = _TRAILING_LINKS.search(body)
    if not m or m.start() == 0:
        return body, []
    return body[: m.start()].rstrip(), _links(m.group(0))


def _block(text: str, section_norm: str) -> list[dict[str, Any]]:
    """Một đoạn (các dòng liền nhau) -> các khối hiển thị."""
    lines = text.split("\n")
    if re.fullmatch(r"[-*_]{3,}", text):
        return []  # đường kẻ "---": các thẻ đã tách nhau, bỏ
    if all(line.startswith("|") for line in lines):
        return [{"type": "table", "html": to_html(text)}]

    if _SOURCES_LABEL.match(normalize(lines[0]).strip("*")) and len(lines) > 1:
        return [{"type": "sources", "links": _links("\n".join(lines[1:]))}]
    if m := _INLINE_SOURCES.match(text):
        return [{"type": "sources_inline", "links": _links(m.group(1))}]

    if m := _TOP.match(text):
        body, sources = _split_sources(m.group(3).strip())
        return [
            {
                "type": "top",
                "num": int(m.group(1)),
                "title_html": inline_html(m.group(2).strip().rstrip(".")),
                "body_html": inline_html(body),
                "sources": sources,
            }
        ]

    if section_norm.startswith(("sources", "nguon")) and all(line.startswith("- ") for line in lines):
        return [{"type": "sources", "links": _links(text)}]  # mục "## Sources:" chỉ có danh sách link

    if m := _ITEM.match(text):
        rest = m.group(3).strip()
        meta = None
        if m.group(2) and "\n" in rest:  # bản tuần: "**Tiêu đề** — 12–13/11" rồi xuống dòng là nội dung
            meta, _, rest = rest.partition("\n")
            meta = meta.strip()
        body, sources = _split_sources(rest.strip())
        return [
            {
                "type": "item",
                "title_html": inline_html(m.group(1).strip().rstrip(".")),
                "meta": meta,
                "body_html": inline_html(body),
                "sources": sources,
            }
        ]

    timeline_section = any(k in section_norm for k in ("theo doi", "tuan toi", "sap toi"))
    if timeline_section and lines[0].startswith("- "):
        entries = [_TIMELINE_ENTRY.match(line) for line in lines]
        if all(entries):
            return [
                {
                    "type": "timeline",
                    "entries": [
                        {"when": e.group(1).strip().rstrip(":"), "html": inline_html(e.group(2).lstrip(": "))}
                        for e in entries
                    ],
                }
            ]

    return [{"type": "html", "html": to_html(text)}]


def _kind(title_norm: str, blocks: list[dict[str, Any]]) -> tuple[str, str | None]:
    types = {b["type"] for b in blocks}
    if _SOURCES_LABEL.match(title_norm) or types == {"sources"}:
        return "sources", None
    if "top" in types:
        return "top", None
    if "timeline" in types:
        return "timeline", None
    if types == {"table"} or (types <= {"table", "html"} and "table" in types and "thi truong" in title_norm):
        return "table", None
    for tone, keys in _TONES:
        if any(k in title_norm for k in keys):
            return "category", tone
    return "category", None


def _section(title: str, text: str) -> list[dict[str, Any]]:
    """Một mục "##" -> một hoặc hai mục (danh sách "Sources:" ở cuối mục được tách thành mục riêng)."""
    icon, name = None, title
    if m := _ICON.match(title):
        icon, name = m.group(1), m.group(2)
    name = name.rstrip(":").strip()
    title_norm = normalize(name)

    blocks: list[dict[str, Any]] = []
    for chunk in re.split(r"\n\s*\n", text.strip()):
        if chunk.strip():
            blocks.extend(_block(chunk.strip(), title_norm))

    # Danh sách nguồn (mục "## Sources:", hoặc "Sources:" nằm cuối mục cuối của bản ngày) thành mục Nguồn riêng
    sections = []
    own = [b for b in blocks if b["type"] != "sources"]
    links = [link for b in blocks if b["type"] == "sources" for link in b["links"]]
    if own:
        kind, tone = _kind(title_norm, own)
        sections.append({"title": name, "icon": icon, "kind": kind, "tone": tone, "blocks": own})
    if links:
        sections.append(
            {
                "title": "Nguồn",
                "icon": None,
                "kind": "sources",
                "tone": None,
                "blocks": [{"type": "sources", "links": links}],
            }
        )
    return sections


def structure(markdown: str) -> dict[str, Any] | None:
    """Markdown bản tin -> {"updated": dòng "Cập nhật lúc", "sections": [...]}; None nếu không có mục nào."""
    text = refang(markdown).strip()
    parts = re.split(r"^##\s+(.+?)\s*$", text, flags=re.MULTILINE)
    if len(parts) < 3:
        return None
    intro, rest = parts[0].strip(), parts[1:]

    updated = None
    intro_blocks: list[dict[str, Any]] = []
    for chunk in re.split(r"\n\s*\n", intro):
        chunk = chunk.strip()
        if not chunk:
            continue
        if updated is None and "cap nhat" in normalize(chunk.split("\n")[0]):
            updated = chunk.lstrip("🕗 ").strip()
        else:
            intro_blocks.append({"type": "html", "html": to_html(chunk)})

    sections: list[dict[str, Any]] = []
    if intro_blocks:
        sections.append({"title": "Mở đầu", "icon": None, "kind": "category", "tone": None, "blocks": intro_blocks})
    for title, body in zip(rest[0::2], rest[1::2], strict=True):
        sections.extend(_section(title, body))
    return {"updated": updated, "sections": sections}
