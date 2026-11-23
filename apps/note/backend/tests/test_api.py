from fastapi.testclient import TestClient

from note.main import app


def test_requires_login():
    with TestClient(app) as anon:
        assert anon.get("/api/notes").status_code == 401


def test_create_without_due_and_order(client):
    assert client.get("/api/notes").json() == []
    a = client.post("/api/notes", json={"content": "Ý tưởng:\n  - đi Đà Lạt  \n\n"}).json()
    assert a["content"] == "Ý tưởng:\n  - đi Đà Lạt" and a["due"] is None and a["done"] is False
    b = client.post("/api/notes", json={"content": "Số wifi quán cà phê"}).json()
    c = client.post("/api/notes", json={"content": "Nộp báo cáo", "due": "2026-11-30"}).json()
    d = client.post("/api/notes", json={"content": "Gọi điện", "due": "2026-11-25"}).json()
    # có hạn lên trên (hạn gần trước), không có hạn xếp dưới (mới ghi trước)
    assert [n["id"] for n in client.get("/api/notes").json()] == [d["id"], c["id"], b["id"], a["id"]]


def test_content_validation(client):
    assert client.post("/api/notes", json={"content": " \n  \n"}).status_code == 422
    assert client.post("/api/notes", json={"content": "x" * 5001}).status_code == 422
    n = client.post("/api/notes", json={"content": "Ghi chú"}).json()
    assert client.patch(f"/api/notes/{n['id']}", json={"content": ""}).status_code == 422
    assert client.patch(f"/api/notes/{n['id']}", json={"content": None}).status_code == 422


def test_toggle_done_and_edit(client):
    n = client.post("/api/notes", json={"content": "Việc", "due": "2026-12-01"}).json()
    other = client.post("/api/notes", json={"content": "Ghi chú khác"}).json()

    done = client.patch(f"/api/notes/{n['id']}", json={"done": True}).json()
    assert done["done"] is True and done["done_at"] is not None
    assert done["due"] == "2026-12-01"  # không gửi due thì giữ nguyên
    # đã xong xếp sau
    assert [x["id"] for x in client.get("/api/notes").json()] == [other["id"], n["id"]]

    undone = client.patch(f"/api/notes/{n['id']}", json={"done": False, "due": None, "content": "Mới"}).json()
    assert undone["done"] is False and undone["done_at"] is None
    assert undone["due"] is None and undone["content"] == "Mới"


def test_delete_and_clear_done(client):
    a = client.post("/api/notes", json={"content": "A"}).json()
    b = client.post("/api/notes", json={"content": "B"}).json()
    c = client.post("/api/notes", json={"content": "C"}).json()
    assert client.delete(f"/api/notes/{a['id']}").status_code == 204
    assert client.delete(f"/api/notes/{a['id']}").status_code == 404
    client.patch(f"/api/notes/{b['id']}", json={"done": True})
    assert client.delete("/api/notes/done").status_code == 204
    assert [x["id"] for x in client.get("/api/notes").json()] == [c["id"]]


def test_users_are_isolated(make_client):
    alice, bob = make_client(), make_client()
    n = alice.post("/api/notes", json={"content": "Bí mật"}).json()
    assert bob.get("/api/notes").json() == []
    assert bob.patch(f"/api/notes/{n['id']}", json={"done": True}).status_code == 404
    assert bob.delete(f"/api/notes/{n['id']}").status_code == 404
    bob.post("/api/notes", json={"content": "Của Bob"})
    bob.delete("/api/notes/done")
    assert [x["content"] for x in alice.get("/api/notes").json()] == ["Bí mật"]
