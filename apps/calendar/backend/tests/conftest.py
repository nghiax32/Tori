import os
import tempfile

# Phải đặt trước khi import app: DB test nằm ở thư mục tạm, không đụng tới data/ thật.
os.environ["DATA_DIR"] = tempfile.mkdtemp(prefix="calendar-test-")
os.environ["TORI_ENV"] = "dev"
os.environ["GOOGLE_CLIENT_ID"] = ""
os.environ["GOOGLE_CLIENT_SECRET"] = ""

import itertools  # noqa: E402

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402
from tori_core import get_settings  # noqa: E402

get_settings.cache_clear()  # phòng khi test của app khác đã đọc cấu hình trước

_emails = itertools.count()


@pytest.fixture
def client():
    from calendar_app.main import app

    with TestClient(app) as c:
        r = c.post("/api/auth/dev-login", json={"email": f"user{next(_emails)}@example.com"})
        assert r.status_code == 200
        yield c


@pytest.fixture
def anon_client():
    from calendar_app.main import app

    with TestClient(app) as c:
        yield c
