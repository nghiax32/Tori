from datetime import date, timedelta

from calendar_app.holidays import holiday_rules
from calendar_app.lunar import lunar_to_solar, solar_to_lunar


def _holiday(client, title: str) -> dict:
    [event] = [e for e in client.get("/api/events", params={"q": title}).json() if e["title"] == title]
    return event


def test_holidays_become_events(client):
    titles = {e["title"] for e in client.get("/api/events", params={"limit": 200}).json() if e["holiday"]}
    assert titles == {h.name for h, _, _ in holiday_rules()}

    event = _holiday(client, "Quốc khánh")
    assert (event["kind"], event["calendar"], event["rule_month"], event["rule_day"]) == ("annual", "solar", 9, 2)
    assert _holiday(client, "Tết Trung thu")["lunar_label"] == "15/8 âm lịch"
    assert event["labels"] == ["Ngày lễ"]
    assert client.get("/api/labels").json() == ["Ngày lễ"]

    # Gọi API nhiều lần không tạo trùng
    client.get("/api/events")
    assert len([e for e in client.get("/api/events", params={"q": "quoc khanh"}).json() if e["holiday"]]) == 1


def test_holiday_cannot_be_deleted_or_renamed(client):
    event = _holiday(client, "Quốc khánh")
    url = f"/api/events/{event['id']}"
    assert client.delete(url).status_code == 403
    assert client.patch(url, json={"title": "Ngày khác"}).status_code == 403
    assert client.patch(url, json={"calendar": "solar", "rule_month": 9, "rule_day": 3}).status_code == 403
    assert client.patch(url, json={"archived": True}).status_code == 403
    assert client.get(url).status_code == 200

    # Theo dõi, nhãn, ghi chú thì sửa được; gửi lại đúng tên cũ cũng không sao
    r = client.patch(url, json={"title": "Quốc khánh", "tracked": True, "labels": ["Nghỉ"], "note": "Về quê"})
    assert r.status_code == 200
    # Nhãn "Ngày lễ" cố định: gửi thiếu thì vẫn giữ
    assert (r.json()["tracked"], set(r.json()["labels"]), r.json()["note"]) == (True, {"Nghỉ", "Ngày lễ"}, "Về quê")
    assert client.patch(url, json={"labels": []}).json()["labels"] == ["Ngày lễ"]


def test_holiday_label_is_reserved(client):
    def rejected(r):
        return r.status_code == 422 and "chỉ dành cho các ngày lễ" in r.json()["detail"]

    body = {"title": "Đi biển", "kind": "occasional", "start_date": "2026-07-01"}
    assert rejected(client.post("/api/events", json={**body, "labels": ["ngày LỄ"]}))
    r = client.post("/api/events", json=body)
    event, occ = r.json()["event"], r.json()["occurrence"]
    assert rejected(client.patch(f"/api/events/{event['id']}", json={"labels": ["Ngày lễ"]}))
    assert rejected(client.patch(f"/api/occurrences/{occ['id']}", json={"labels": ["Ngày lễ"]}))
    assert rejected(client.post("/api/events", json={**body, "start_date": "2026-08-01", "labels": ["Ngày lễ"]}))


def test_tracked_holiday(client):
    event = _holiday(client, "Quốc khánh")
    client.patch(f"/api/events/{event['id']}", json={"tracked": True})
    tracked = client.get("/api/tracked").json()
    assert [x["occurrence"]["title"] for x in tracked["upcoming"]] == ["Quốc khánh"]
    assert [x["occurrence"]["title"] for x in tracked["past"]] == ["Quốc khánh"]
    assert tracked["upcoming"][0]["occurrence"]["holiday"] is True


def test_holiday_shown_in_corner_not_as_chip(client):
    occs = client.get("/api/occurrences", params={"start": "2026-09-01", "end": "2026-09-30"}).json()
    assert occs == []

    days = client.get("/api/lunar/range", params={"start": "2026-09-02", "end": "2026-09-02"}).json()
    [holiday] = days[0]["holidays"]
    assert holiday["name"] == "Quốc khánh"
    assert holiday["occurrence"]["event_id"] == _holiday(client, "Quốc khánh")["id"]
    assert holiday["occurrence"]["start_date"] == "2026-09-02"


def test_new_year_eve_is_last_day_of_lunar_year(client):
    eve = lunar_to_solar(1, 1, 2027, False) - timedelta(days=1)
    days = client.get("/api/lunar/range", params={"start": eve.isoformat(), "end": eve.isoformat()}).json()
    [holiday] = [x for x in days[0]["holidays"] if x["name"] == "Giao thừa"]
    assert holiday["occurrence"]["start_date"] == eve.isoformat()

    event = _holiday(client, "Giao thừa")
    client.patch(f"/api/events/{event['id']}", json={"tracked": True})
    for side in ("upcoming", "past"):  # mọi năm: hôm sau là mùng 1 Tết
        [item] = client.get("/api/tracked").json()[side]
        d = date.fromisoformat(item["occurrence"]["start_date"])
        assert (solar_to_lunar(d + timedelta(days=1)).day, solar_to_lunar(d + timedelta(days=1)).month) == (1, 1)


def test_filter_finds_holidays(client):
    params = {"start": "2026-01-01", "end": "2026-12-31", "q": "trung thu"}
    assert client.get("/api/occurrences", params=params).json() == []  # lưới lịch: không có thẻ ngày lễ
    [occ] = client.get("/api/occurrences", params={**params, "holidays": True}).json()
    assert (occ["title"], occ["start_date"], occ["holiday"]) == ("Tết Trung thu", "2026-09-25", True)

    # Lọc theo nhãn gắn cho ngày lễ
    client.patch(f"/api/events/{occ['event_id']}", json={"labels": ["Ăn bánh"]})
    found = client.get("/api/occurrences", params={**params, "q": "an banh", "holidays": True}).json()
    assert [o["title"] for o in found] == ["Tết Trung thu"]
