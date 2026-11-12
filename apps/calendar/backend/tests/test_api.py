from calendar_app.lunar import lunar_to_solar


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


def _dates(client, event_id, start, end):
    occs = client.get("/api/occurrences", params={"start": start, "end": end, "event_id": event_id}).json()
    return [o["start_date"] for o in occs]


def test_annual_is_one_row_shown_every_year_from_rule_year(client):
    r = client.post(
        "/api/events",
        json={"title": "Sinh nhật mẹ", "kind": "annual", "calendar": "solar", "rule_day": 15, "rule_month": 3, "rule_year": 1965},
    )
    assert r.status_code == 201
    event = r.json()["event"]
    assert (event["rule_month"], event["rule_day"], event["rule_year"]) == (3, 15, 1965)
    assert event["occurrence_count"] == 0  # không lưu lần nào

    assert _dates(client, event["id"], "1963-01-01", "1967-12-31") == ["1965-03-15", "1966-03-15", "1967-03-15"]
    occs = client.get("/api/occurrences", params={"start": "2030-03-01", "end": "2030-03-31"}).json()
    assert [(o["id"], o["start_date"]) for o in occs] == [(None, "2030-03-15")]

    # Không thêm tay được
    assert client.post(f"/api/events/{event['id']}/occurrences", json={"start_date": "2026-01-01"}).status_code == 409


def test_annual_without_year_shows_every_year(client):
    r = client.post("/api/events", json={"title": "Kỷ niệm", "kind": "annual", "calendar": "solar", "rule_day": 1, "rule_month": 6})
    assert r.json()["event"]["rule_year"] is None
    assert _dates(client, r.json()["event"]["id"], "1900-01-01", "1901-12-31") == ["1900-06-01", "1901-06-01"]


def test_annual_lunar_with_lunar_year(client):
    # 20/12 âm năm 2025 rơi vào 2026 dương; năm âm 2024 (rơi vào 2025 dương) bị bỏ
    r = client.post(
        "/api/events",
        json={"title": "Giỗ ông", "kind": "annual", "calendar": "lunar", "rule_day": 20, "rule_month": 12, "rule_year": 2025},
    )
    assert r.status_code == 201
    assert r.json()["event"]["lunar_label"] == "20/12 âm lịch"
    assert _dates(client, r.json()["event"]["id"], "2025-01-01", "2026-12-31") == [str(lunar_to_solar(20, 12, 2025))]


def test_annual_rule_validation(client):
    base = {"kind": "annual", "rule_day": 29, "rule_month": 2}
    assert client.post("/api/events", json={**base, "title": "a", "calendar": "solar", "rule_year": 2023}).status_code == 422
    assert client.post("/api/events", json={**base, "title": "b", "calendar": "solar", "rule_year": 2024}).status_code == 201
    assert client.post("/api/events", json={**base, "title": "c", "calendar": "solar"}).status_code == 201
    # 2026 không nhuận tháng 6 âm
    leap = {"kind": "annual", "calendar": "lunar", "rule_day": 1, "rule_month": 6, "rule_leap": True}
    assert client.post("/api/events", json={**leap, "title": "d", "rule_year": 2026}).status_code == 422
    assert client.post("/api/events", json={**leap, "title": "e", "rule_year": 2025}).status_code == 201
    assert client.post("/api/events", json={"title": "f", "kind": "annual", "calendar": "lunar"}).status_code == 422


def test_duplicate_title_with_other_kind_conflicts(client):
    client.post("/api/events", json={"title": "Sinh nhật bố", "kind": "annual", "calendar": "solar", "rule_day": 2, "rule_month": 1})
    r = client.post("/api/events", json={"title": "sinh nhat bo", "kind": "occasional", "start_date": "2026-01-02"})
    assert r.status_code == 409
    assert "event_id" in r.json()["detail"]


def test_rule_change(client):
    r = client.post("/api/events", json={"title": "Kỷ niệm", "kind": "annual", "calendar": "solar", "rule_month": 6, "rule_day": 1})
    event_id = r.json()["event"]["id"]
    r = client.patch(f"/api/events/{event_id}", json={"calendar": "solar", "rule_month": 6, "rule_day": 2, "rule_year": 2027})
    assert r.status_code == 200
    assert _dates(client, event_id, "2026-01-01", "2028-12-31") == ["2027-06-02", "2028-06-02"]


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
