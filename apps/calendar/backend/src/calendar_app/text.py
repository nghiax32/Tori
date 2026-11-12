import re
import unicodedata

_SPACES = re.compile(r"\s+")


def clean_title(title: str) -> str:
    """Bỏ khoảng trắng thừa, giữ nguyên chữ hoa và dấu."""
    return _SPACES.sub(" ", title).strip()


def normalize_title(title: str) -> str:
    """'  Thay  Dầu xe ' -> 'thay dau xe': chữ thường, bỏ dấu, đ -> d, gộp khoảng trắng."""
    s = title.replace("đ", "d").replace("Đ", "D")
    s = unicodedata.normalize("NFD", s)
    s = "".join(c for c in s if unicodedata.category(c) != "Mn")
    return clean_title(s).casefold()
