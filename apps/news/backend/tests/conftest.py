import os
import tempfile

# Phải đặt trước khi import app: DB test nằm ở thư mục tạm, không đụng tới data/ thật.
os.environ["DATA_DIR"] = tempfile.mkdtemp(prefix="news-test-")
os.environ["TORI_ENV"] = "dev"
os.environ["GOOGLE_CLIENT_ID"] = ""
os.environ["GOOGLE_CLIENT_SECRET"] = ""
for name in ("GMAIL_CLIENT_ID", "GMAIL_CLIENT_SECRET", "GMAIL_REFRESH_TOKEN", "NEWS_OWNER_EMAILS"):
    os.environ[name] = ""

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402
from tori_core import get_settings  # noqa: E402

get_settings.cache_clear()  # phòng khi test của app khác đã đọc cấu hình trước


@pytest.fixture
def client():
    from news.main import app

    with TestClient(app) as c:
        assert c.post("/api/auth/dev-login", json={"email": "owner@example.com"}).status_code == 200
        yield c


@pytest.fixture(autouse=True)
def clean_db(monkeypatch, tmp_path):
    from news.config import get_news_settings
    from news.db import SessionLocal, init_db
    from news.models import Bulletin, SyncState

    # Không đọc .env thật của repo (có thể chứa GMAIL_*, NEWS_OWNER_EMAILS)
    monkeypatch.chdir(tmp_path)
    init_db()
    with SessionLocal() as s:
        s.query(Bulletin).delete()
        s.query(SyncState).delete()
        s.commit()
    get_news_settings.cache_clear()
    yield
    get_news_settings.cache_clear()
