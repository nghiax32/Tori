import importlib.util
from pathlib import Path

_spec = importlib.util.spec_from_file_location("changed_apps", Path(__file__).parent.parent / "changed_apps.py")
changed_apps = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(changed_apps)

APPS = ["hub", "calendar", "pet"]


def test_only_changed_app():
    assert changed_apps.plan(["apps/calendar/backend/src/calendar_app/api.py"], APPS) == (["calendar"], False)


def test_manifest_change_also_redeploys_hub():
    assert changed_apps.plan(["apps/pet/app.toml"], APPS) == (["hub", "pet"], False)


def test_shared_package_redeploys_all():
    assert changed_apps.plan(["packages/ui/src/tokens.css"], APPS) == (sorted(APPS), False)
    assert changed_apps.plan(["uv.lock"], APPS) == (sorted(APPS), False)


def test_infra_and_docs():
    assert changed_apps.plan(["infra/Caddyfile"], APPS) == ([], True)
    assert changed_apps.plan(["docs/deploy.md", "templates/app/app.toml"], APPS) == ([], False)


def test_unknown_history_deploys_everything():
    assert changed_apps.plan(None, APPS) == (APPS, True)
