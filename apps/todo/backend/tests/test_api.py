from fastapi.testclient import TestClient

from todo.main import app


def test_requires_login():
    with TestClient(app) as anon:
        assert anon.get("/api/tasks").status_code == 401


def test_create_list_order(client):
    assert client.get("/api/tasks").json() == []
    a = client.post("/api/tasks", json={"title": "  Mua   sữa "}).json()
    assert a["title"] == "Mua sữa" and a["done"] is False and a["due"] is None
    b = client.post("/api/tasks", json={"title": "Nộp báo cáo", "due": "2026-11-30"}).json()
    c = client.post("/api/tasks", json={"title": "Gọi điện", "due": "2026-11-25"}).json()
    # có hạn lên trước (hạn gần trước), không có hạn xếp sau
    assert [t["id"] for t in client.get("/api/tasks").json()] == [c["id"], b["id"], a["id"]]


def test_title_validation(client):
    assert client.post("/api/tasks", json={"title": "   "}).status_code == 422
    assert client.post("/api/tasks", json={"title": "x" * 201}).status_code == 422
    t = client.post("/api/tasks", json={"title": "Việc"}).json()
    assert client.patch(f"/api/tasks/{t['id']}", json={"title": ""}).status_code == 422
    assert client.patch(f"/api/tasks/{t['id']}", json={"title": None}).status_code == 422


def test_toggle_done_and_edit(client):
    t = client.post("/api/tasks", json={"title": "Việc", "due": "2026-12-01"}).json()
    other = client.post("/api/tasks", json={"title": "Việc khác"}).json()

    done = client.patch(f"/api/tasks/{t['id']}", json={"done": True}).json()
    assert done["done"] is True and done["done_at"] is not None
    assert done["due"] == "2026-12-01"  # không gửi due thì giữ nguyên
    # việc đã xong xếp sau việc chưa xong
    assert [x["id"] for x in client.get("/api/tasks").json()] == [other["id"], t["id"]]

    undone = client.patch(f"/api/tasks/{t['id']}", json={"done": False, "due": None, "title": "Việc mới"}).json()
    assert undone["done"] is False and undone["done_at"] is None
    assert undone["due"] is None and undone["title"] == "Việc mới"


def test_delete_and_clear_done(client):
    a = client.post("/api/tasks", json={"title": "A"}).json()
    b = client.post("/api/tasks", json={"title": "B"}).json()
    c = client.post("/api/tasks", json={"title": "C"}).json()
    assert client.delete(f"/api/tasks/{a['id']}").status_code == 204
    assert client.delete(f"/api/tasks/{a['id']}").status_code == 404
    client.patch(f"/api/tasks/{b['id']}", json={"done": True})
    assert client.delete("/api/tasks/done").status_code == 204
    assert [x["id"] for x in client.get("/api/tasks").json()] == [c["id"]]


def test_users_are_isolated(make_client):
    alice, bob = make_client(), make_client()
    t = alice.post("/api/tasks", json={"title": "Bí mật"}).json()
    assert bob.get("/api/tasks").json() == []
    assert bob.patch(f"/api/tasks/{t['id']}", json={"done": True}).status_code == 404
    assert bob.delete(f"/api/tasks/{t['id']}").status_code == 404
    bob.post("/api/tasks", json={"title": "Của Bob"})
    bob.delete("/api/tasks/done")
    assert [x["title"] for x in alice.get("/api/tasks").json()] == ["Bí mật"]
