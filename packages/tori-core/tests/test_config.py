import shutil
from pathlib import Path

from tori_core.config import Settings

ENV_EXAMPLE = Path(__file__).resolve().parents[3] / ".env.example"


def test_env_example_loads(tmp_path, monkeypatch):
    # .env.example có các dòng rỗng như "PUBLIC_PORT=" -> phải dùng giá trị mặc định, không lỗi
    shutil.copy(ENV_EXAMPLE, tmp_path / ".env")
    monkeypatch.chdir(tmp_path)
    for name in ("PUBLIC_PORT", "GOOGLE_CLIENT_ID", "TORI_DOMAIN"):
        monkeypatch.delenv(name, raising=False)
    settings = Settings()
    assert settings.public_port is None
    assert settings.app_url("calendar") == "http://calendar.localhost"


def test_empty_env_var_uses_default(monkeypatch, tmp_path):
    monkeypatch.chdir(tmp_path)
    monkeypatch.setenv("PUBLIC_PORT", "")
    assert Settings().public_port is None
    monkeypatch.setenv("PUBLIC_PORT", "8080")
    assert Settings().app_url() == "http://localhost:8080"
