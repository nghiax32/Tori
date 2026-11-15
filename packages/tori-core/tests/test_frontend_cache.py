from fastapi import FastAPI
from fastapi.testclient import TestClient
from tori_core.app import mount_frontend


def test_frontend_cache_headers(tmp_path):
    (tmp_path / "index.html").write_text("<!doctype html><title>x</title>")
    (tmp_path / "assets").mkdir()
    (tmp_path / "assets" / "index-abc123.js").write_text("console.log(1)")
    app = FastAPI()
    mount_frontend(app, tmp_path)
    client = TestClient(app)

    page = client.get("/")
    assert page.status_code == 200 and page.headers["cache-control"] == "no-cache"  # luôn hỏi lại server
    asset = client.get("/assets/index-abc123.js")
    assert asset.headers["cache-control"] == "public, max-age=31536000, immutable"
    # Mở lại trang: trình duyệt gửi ETag, server trả 304 vẫn kèm no-cache
    again = client.get("/", headers={"if-none-match": page.headers["etag"]})
    assert again.status_code == 304 and again.headers["cache-control"] == "no-cache"
    assert "cache-control" not in client.get("/assets/missing.js").headers  # file không có: không lưu
