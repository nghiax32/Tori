import os
import tomllib
from pathlib import Path

from tori_core import create_app, get_settings, mount_frontend

app = create_app("hub", title="Tori")


def apps_dir() -> Path:
    # apps/hub/backend/src/hub/main.py -> parents[4] = apps/
    return Path(os.environ.get("APPS_DIR") or Path(__file__).resolve().parents[4])


@app.get("/api/apps", tags=["hub"])
def list_apps() -> list[dict]:
    """Đọc apps/*/app.toml để liệt kê các mini app (app mới tự xuất hiện, không cần sửa hub)."""
    settings = get_settings()
    result = []
    for path in sorted(apps_dir().glob("*/app.toml")):
        meta = tomllib.loads(path.read_text("utf-8"))
        if not meta.get("listed", True):
            continue
        result.append(
            {
                "name": meta["name"],
                "title": meta.get("title", meta["name"]),
                "description": meta.get("description", ""),
                "icon": meta.get("icon", ""),
                "url": settings.app_url(meta.get("subdomain", meta["name"])),
            }
        )
    return result


mount_frontend(app)
