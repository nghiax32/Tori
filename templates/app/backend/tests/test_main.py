from fastapi.testclient import TestClient

from __APP_MODULE__.main import app


def test_hello():
    client = TestClient(app)
    assert client.get("/api/health").json()["status"] == "ok"
    assert "message" in client.get("/api/hello").json()
    assert client.get("/api/private").status_code == 401
