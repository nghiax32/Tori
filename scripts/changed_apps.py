"""Xác định app nào cần deploy lại dựa trên các file thay đổi giữa hai commit.

    python3 scripts/changed_apps.py <base_sha> <head_sha>
    python3 scripts/changed_apps.py --all

In ra (định dạng $GITHUB_OUTPUT):
    apps=["hub","calendar"]
    infra=true|false

Quy tắc:
- apps/<x>/**                    -> x
- apps/<x>/app.toml              -> x và hub (hub hiển thị danh sách app)
- packages/**, pyproject.toml, uv.lock -> mọi app (phần dùng chung thay đổi)
- compose.yaml, infra/**         -> infra=true (chép lại cấu hình lên server, reload Caddy)
- còn lại (docs, scripts, templates...) -> không deploy
"""

import json
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SHARED_PREFIXES = ("packages/",)
SHARED_FILES = {"pyproject.toml", "uv.lock"}
INFRA_PREFIXES = ("infra/",)
INFRA_FILES = {"compose.yaml"}


def all_apps() -> list[str]:
    return sorted(p.parent.name for p in (ROOT / "apps").glob("*/Dockerfile"))


def changed_files(base: str, head: str) -> list[str] | None:
    """None = không so sánh được (push đầu tiên, force-push...) -> deploy tất cả."""
    if not base or set(base) == {"0"}:
        return None
    try:
        out = subprocess.run(
            ["git", "diff", "--name-only", base, head], cwd=ROOT, check=True, capture_output=True, text=True
        ).stdout
    except subprocess.CalledProcessError:
        return None
    return [line for line in out.splitlines() if line]


def plan(files: list[str] | None, apps: list[str]) -> tuple[list[str], bool]:
    if files is None:
        return apps, True
    selected: set[str] = set()
    infra = False
    for f in files:
        if f.startswith(SHARED_PREFIXES) or f in SHARED_FILES:
            selected.update(apps)
        elif f.startswith(INFRA_PREFIXES) or f in INFRA_FILES:
            infra = True
        elif f.startswith("apps/"):
            parts = f.split("/")
            if len(parts) > 2 and parts[1] in apps:
                selected.add(parts[1])
                if parts[2] == "app.toml" and "hub" in apps:
                    selected.add("hub")
    return sorted(selected), infra


def main(argv: list[str]) -> None:
    apps = all_apps()
    if argv[1:2] == ["--all"]:
        files = None
    elif len(argv) == 3:
        files = changed_files(argv[1], argv[2])
    else:
        sys.exit(__doc__)
    selected, infra = plan(files, apps)
    print(f"apps={json.dumps(selected)}")
    print(f"infra={'true' if infra else 'false'}")


if __name__ == "__main__":
    main(sys.argv)
