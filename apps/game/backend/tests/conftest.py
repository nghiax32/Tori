import os
import tempfile

# Phải đặt trước khi import app: DB test nằm ở thư mục tạm, không đụng tới data/ thật.
os.environ["DATA_DIR"] = tempfile.mkdtemp(prefix="game-test-")
os.environ["TORI_ENV"] = "dev"
os.environ["TORI_DOMAIN"] = "localhost"  # không lấy domain trong .env: cookie phải gửi được tới host "testserver"
os.environ["GOOGLE_CLIENT_ID"] = ""
os.environ["GOOGLE_CLIENT_SECRET"] = ""

import itertools  # noqa: E402

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402
from tori_core import get_settings  # noqa: E402

get_settings.cache_clear()  # phòng khi test của app khác đã đọc cấu hình trước

_emails = itertools.count()


def login(c: TestClient, email: str | None = None, name: str | None = None) -> None:
    r = c.post("/api/auth/dev-login", json={"email": email or f"player{next(_emails)}@example.com", "name": name})
    assert r.status_code == 200


@pytest.fixture
def make_client():
    from game.main import app

    clients = []

    def make(email: str | None = None, name: str | None = None) -> TestClient:
        c = TestClient(app)
        c.__enter__()
        clients.append(c)
        login(c, email, name)
        return c

    yield make
    for c in clients:
        c.__exit__(None, None, None)


@pytest.fixture
def client(make_client):
    return make_client()
