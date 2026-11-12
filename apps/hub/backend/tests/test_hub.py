from fastapi.testclient import TestClient
from tori_core import get_settings

from hub.main import app


def test_lists_apps_from_manifests():
    apps = TestClient(app).get("/api/apps").json()
    names = [a["name"] for a in apps]
    assert "calendar" in names
    assert "hub" not in names  # hub có listed = false
    cal = next(a for a in apps if a["name"] == "calendar")
    assert cal["url"] == get_settings().app_url("calendar")  # không phụ thuộc .env của máy
