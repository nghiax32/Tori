from datetime import date

from calendar_app.generator import today


def test_requires_login(anon_client):
    assert anon_client.get("/api/events").status_code == 401
    assert anon_client.get("/api/health").json()["status"] == "ok"


def test_occasional_event_reuse_and_filter(client):
    r = client.post("/api/events", json={"title": "Thay dầu xe", "kind": "occasional", "start_date": "2026-03-02"})
    assert r.status_code == 201
    event_id = r.json()["event"]["id"]

    # Gõ lại cùng tên (khác hoa/thường, dấu cách) -> dùng lại sự kiện cũ
    r = client.post("/api/events", json={"title": "thay  dầu XE", "kind": "occasional", "start_date": "2026-09-02"})
    assert r.status_code == 200
    assert r.json()["reused"] is True
    assert r.json()["event"]["id"] == event_id
    assert r.json()["event"]["occurrence_count"] == 2

    client.post(f"/api/events/{event_id}/occurrences", json={"start_date": "2025-12-01"})

    # Autocomplete không dấu
    [suggestion] = client.get("/api/events", params={"q": "thay dau"}).json()
    assert suggestion["title"] == "Thay dầu xe"
    assert suggestion["occurrence_count"] == 3
    assert suggestion["last_date"] == "2026-09-02"

    # "Tất cả các lần thay dầu năm 2026"
    occs = client.get("/api/occurrences", params={"start": "2026-01-01", "end": "2026-12-31", "q": "dầu"}).json()
    assert [o["start_date"] for o in occs] == ["2026-03-02", "2026-09-02"]


def test_trip_with_range(client):
    r = client.post(
        "/api/events",
        json={"title": "Đi Đà Lạt", "kind": "occasional", "start_date": "2026-05-03", "end_date": "2026-05-06"},
    )
    assert r.status_code == 201
    # Giao với khoảng truy vấn dù bắt đầu trước đó
    occs = client.get("/api/occurrences", params={"start": "2026-05-05", "end": "2026-05-31"}).json()
    assert len(occs) == 1 and occs[0]["end_date"] == "2026-05-06"

    bad = client.post(
        "/api/events",
        json={"title": "Sai", "kind": "occasional", "start_date": "2026-05-06", "end_date": "2026-05-03"},
    )
    assert bad.status_code == 422


def test_annual_solar_generates_current_year(client):
    year = today().year
    r = client.post(
        "/api/events", json={"title": "Sinh nhật mẹ", "kind": "annual", "calendar": "solar", "origin_date": "1965-03-15"}
    )
    assert r.status_code == 201
    body = r.json()
    assert (body["event"]["rule_month"], body["event"]["rule_day"]) == (3, 15)
    assert body["occurrence"]["start_date"] == f"{year}-03-15"
    assert body["occurrence"]["created_by"] == "generator"

    # Không xoá lẻ được, và không thêm tay được
    assert client.delete(f"/api/occurrences/{body['occurrence']['id']}").status_code == 409
    assert client.post(f"/api/events/{body['event']['id']}/occurrences", json={"start_date": "2026-01-01"}).status_code == 409


def test_annual_lunar_from_solar_origin(client):
    # Mất ngày 06/09/2025 dương = 15/7 âm
    r = client.post(
        "/api/events",
        json={"title": "Giỗ ông", "kind": "annual", "calendar": "lunar", "origin_date": "2025-09-06"},
    )
    assert r.status_code == 201
    ev = r.json()["event"]
    assert (ev["rule_month"], ev["rule_day"], ev["rule_leap"]) == (7, 15, False)
    assert ev["lunar_label"] == "15/7 âm lịch"


def test_annual_lunar_direct_input(client):
    r = client.post(
        "/api/events",
        json={"title": "Giỗ bà", "kind": "annual", "calendar": "lunar", "rule_month": 3, "rule_day": 10},
    )
    assert r.status_code == 201
    assert r.json()["event"]["origin_date"] is None


def test_duplicate_title_with_other_kind_conflicts(client):
    client.post("/api/events", json={"title": "Sinh nhật bố", "kind": "annual", "calendar": "solar", "origin_date": "1960-01-02"})
    r = client.post("/api/events", json={"title": "sinh nhat bo", "kind": "occasional", "start_date": "2026-01-02"})
    assert r.status_code == 409
    assert "event_id" in r.json()["detail"]


def test_rule_change_keeps_customized(client):
    year = today().year
    r = client.post("/api/events", json={"title": "Kỷ niệm", "kind": "annual", "calendar": "solar", "rule_month": 6, "rule_day": 1})
    event_id, occ_id = r.json()["event"]["id"], r.json()["occurrence"]["id"]

    # Đổi quy tắc: lần năm nay được tính lại
    client.patch(f"/api/events/{event_id}", json={"calendar": "solar", "rule_month": 6, "rule_day": 2})
    occs = client.get("/api/occurrences", params={"start": f"{year}-01-01", "end": f"{year}-12-31", "event_id": event_id}).json()
    assert [o["start_date"] for o in occs] == [f"{year}-06-02"]

    # Sửa tay rồi đổi quy tắc: lần đã sửa được giữ
    occ_id = occs[0]["id"]
    client.patch(f"/api/occurrences/{occ_id}", json={"start_date": f"{year}-06-05", "note": "dời lịch"})
    client.patch(f"/api/events/{event_id}", json={"calendar": "solar", "rule_month": 6, "rule_day": 3})
    occs = client.get("/api/occurrences", params={"start": f"{year}-01-01", "end": f"{year}-12-31", "event_id": event_id}).json()
    assert [(o["start_date"], o["is_customized"]) for o in occs] == [(f"{year}-06-05", True)]


def test_users_are_isolated(client, anon_client):
    r = client.post("/api/events", json={"title": "Bí mật", "kind": "occasional", "start_date": "2026-01-01"})
    event_id = r.json()["event"]["id"]
    anon_client.post("/api/auth/dev-login", json={"email": "other@example.com"})
    assert anon_client.get(f"/api/events/{event_id}").status_code == 404
    assert anon_client.get("/api/events", params={"q": "bi mat"}).json() == []


def test_lunar_range(client):
    days = client.get("/api/lunar/range", params={"start": "2026-02-16", "end": "2026-02-18"}).json()
    assert [(d["date"], d["day"], d["month"]) for d in days] == [
        ("2026-02-16", 29, 12),  # 29 Tết
        ("2026-02-17", 1, 1),  # mùng 1 Tết
        ("2026-02-18", 2, 1),
    ]
    # tháng 6 nhuận 2025
    [leap_day] = client.get("/api/lunar/range", params={"start": "2025-07-25", "end": "2025-07-25"}).json()
    assert (leap_day["day"], leap_day["month"], leap_day["leap"]) == (1, 6, True)
    # lưới calendar 42 ngày được phép, khoảng quá dài thì không
    assert len(client.get("/api/lunar/range", params={"start": "2026-10-26", "end": "2026-12-06"}).json()) == 42
    assert client.get("/api/lunar/range", params={"start": "2026-01-01", "end": "2026-12-31"}).status_code == 422


def test_lunar_endpoint(client):
    r = client.get("/api/lunar", params={"date": date(2026, 2, 17).isoformat()})
    assert r.json() == {"day": 1, "month": 1, "year": 2026, "leap": False, "label": "1/1 âm lịch"}
