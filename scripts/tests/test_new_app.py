import importlib.util
from pathlib import Path

_spec = importlib.util.spec_from_file_location("new_app", Path(__file__).parent.parent / "new_app.py")
new_app = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(new_app)


def test_module_name_plain():
    assert new_app.module_name("pet") == "pet"
    assert new_app.module_name("word-play") == "word_play"


def test_module_name_avoids_stdlib_and_workspace():
    assert new_app.module_name("calendar") == "calendar_app"
    assert new_app.module_name("email") == "email_app"
    assert new_app.module_name("tori-core") == "tori_core_app"
