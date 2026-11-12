"""Tạo mini app mới từ templates/app.

    uv run scripts/new_app.py pet --title "Pet" --description "Nuôi thú ảo"

Script sẽ:
1. chép templates/app -> apps/<name>, thay các placeholder (__APP_NAME__, ...)
2. thêm service + volume vào compose.yaml và một site vào infra/Caddyfile
3. chạy `uv lock` và `npm install` (bỏ qua bằng --no-install)
"""

import argparse
import re
import shutil
import subprocess
import sys
import tomllib
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
TEMPLATE = ROOT / "templates" / "app"
COMPOSE = ROOT / "compose.yaml"
CADDYFILE = ROOT / "infra" / "Caddyfile"
NAME_RE = re.compile(r"^[a-z][a-z0-9-]{1,30}$")
RESERVED = {"hub", "www", "api", "static"}


def next_ports() -> tuple[int, int]:
    backend, frontend = 8000, 5173
    for path in (ROOT / "apps").glob("*/app.toml"):
        meta = tomllib.loads(path.read_text("utf-8"))
        backend = max(backend, meta.get("dev_backend_port", 0))
        frontend = max(frontend, meta.get("dev_frontend_port", 0))
    return backend + 1, frontend + 1


def insert_before(path: Path, marker: str, text: str) -> None:
    content = path.read_text("utf-8")
    lines = content.splitlines(keepends=True)
    for i, line in enumerate(lines):
        if marker in line:
            lines.insert(i, text)
            path.write_text("".join(lines), "utf-8")
            return
    sys.exit(f"Không tìm thấy dòng đánh dấu '{marker}' trong {path.relative_to(ROOT)}")


def main() -> None:
    parser = argparse.ArgumentParser(description="Tạo mini app mới từ template")
    parser.add_argument("name", help="tên app = subdomain, chữ thường, VD: pet, word-play")
    parser.add_argument("--title", help="tên hiển thị (mặc định: viết hoa từ name)")
    parser.add_argument("--description", default="Mô tả ngắn về app")
    parser.add_argument("--no-install", action="store_true", help="không chạy uv lock / npm install")
    args = parser.parse_args()

    name = args.name
    if not NAME_RE.match(name) or name in RESERVED:
        sys.exit("Tên không hợp lệ: chỉ chữ thường, số, dấu gạch ngang; bắt đầu bằng chữ; không trùng tên dành riêng.")
    dest = ROOT / "apps" / name
    if dest.exists():
        sys.exit(f"apps/{name} đã tồn tại.")

    module = name.replace("-", "_")
    backend_port, frontend_port = next_ports()
    values = {
        "__APP_NAME__": name,
        "__APP_MODULE__": module,
        "__APP_TITLE__": args.title or name.replace("-", " ").title(),
        "__APP_DESCRIPTION__": args.description,
        "__BACKEND_PORT__": str(backend_port),
        "__FRONTEND_PORT__": str(frontend_port),
    }

    def render(text: str) -> str:
        for key, value in values.items():
            text = text.replace(key, value)
        return text

    for src in TEMPLATE.rglob("*"):
        rel = Path(render(str(src.relative_to(TEMPLATE))))
        target = dest / rel
        if src.is_dir():
            target.mkdir(parents=True, exist_ok=True)
            continue
        target.parent.mkdir(parents=True, exist_ok=True)
        try:
            target.write_text(render(src.read_text("utf-8")), "utf-8")
        except UnicodeDecodeError:
            shutil.copy2(src, target)

    insert_before(
        COMPOSE,
        "# @new-app-service",
        f"  {name}:\n"
        f"    <<: *app\n"
        f"    image: ${{IMAGE_PREFIX:-tori}}-{name}:${{TAG:-latest}}\n"
        f"    build: {{ context: ., dockerfile: apps/{name}/Dockerfile }}\n"
        f"    volumes:\n"
        f"      - {module}_data:/data\n\n",
    )
    insert_before(COMPOSE, "# @new-app-volume", f"  {module}_data:\n")
    with CADDYFILE.open("a", encoding="utf-8") as f:
        f.write(f"\n{{$TORI_SCHEME}}://{name}.{{$TORI_DOMAIN}} {{\n\tencode zstd gzip\n\treverse_proxy {name}:8000\n}}\n")

    print(f"✓ Đã tạo apps/{name} (backend :{backend_port}, frontend :{frontend_port})")
    print("✓ Đã thêm vào compose.yaml và infra/Caddyfile")

    if not args.no_install:
        subprocess.run(["uv", "lock"], cwd=ROOT, check=True)
        subprocess.run(["uv", "sync", "--all-packages"], cwd=ROOT, check=True)
        subprocess.run(["npm", "install", "--no-fund", "--no-audit"], cwd=dest / "frontend", check=True)

    print(
        f"""
Chạy thử:
  uv run uvicorn {module}.main:app --reload --port {backend_port}
  cd apps/{name}/frontend && npm run dev      # http://localhost:{frontend_port}
"""
    )


if __name__ == "__main__":
    main()
