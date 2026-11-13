"""Markdown của bản tin -> HTML để hiển thị.

HTML viết sẵn trong markdown bị escape (html=False), link javascript:/data: bị markdown-it chặn,
nên nội dung lấy từ email không chèn được script vào trang.
"""

from markdown_it import MarkdownIt

_md = MarkdownIt("commonmark", {"html": False, "linkify": False, "typographer": False}).enable("table")


def _link_open(self, tokens, idx, options, env):
    # Link nguồn mở tab mới, không gửi thông tin trang Tori sang báo
    tokens[idx].attrSet("target", "_blank")
    tokens[idx].attrSet("rel", "noopener noreferrer")
    return self.renderToken(tokens, idx, options, env)


_md.add_render_rule("link_open", _link_open)


def to_html(markdown: str) -> str:
    return _md.render(markdown)
