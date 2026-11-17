import unicodedata
from datetime import date, timedelta

from learningenglish import api
from learningenglish.db import SessionLocal
from learningenglish.models import EnglishProgress, EnglishRound
from learningenglish.topics import TOPIC_WORDS, TOPICS
from learningenglish.words import WORDS


def _norm(s: str) -> str:
    return unicodedata.normalize("NFC", s).strip().lower()


def test_word_list_is_unambiguous():
    words = [_norm(w) for w, _, _ in WORDS]
    meanings = [_norm(m) for _, _, m in WORDS]
    assert len(WORDS) >= 300
    assert len(set(words)) == len(words)
    assert len(set(meanings)) == len(meanings)  # hai từ cùng nghĩa trong một lượt thì không ghép được
    assert all(ipa.startswith("/") and ipa.endswith("/") and len(ipa) > 2 for _, ipa, _ in WORDS)


def test_review_schedule():
    day = date(2026, 1, 1)
    p = EnglishProgress(reps=0, ease=2.5, interval=0, correct=0, wrong=0)
    intervals = []
    for _ in range(4):
        api.review(p, True, day)
        intervals.append(p.interval)
    assert intervals[:2] == [1, 3] and intervals[2] > 3 and intervals[3] > intervals[2]
    assert p.due == day + timedelta(days=intervals[-1])
    api.review(p, False, day)
    assert (p.reps, p.interval, p.due, p.wrong) == (0, 0, day, 1)
    assert p.ease >= 1.3


def _backdate(round_id: int, seconds: int) -> None:
    with SessionLocal() as s:
        r = s.get(EnglishRound, round_id)
        r.started_at -= timedelta(seconds=seconds)
        s.commit()


def _play(c, ms: int, mistakes: dict | None = None, topic: str | None = None) -> tuple[dict, dict]:
    r = c.post("/api/english/match", json={"topic": topic}).json()
    _backdate(r["id"], ms // 1000 + 5)
    res = c.post(f"/api/english/match/{r['id']}/finish", json={"elapsed_ms": ms, "mistakes": mistakes or {}})
    assert res.status_code == 200, res.text
    return r, res.json()


def _words(r: dict) -> list[str]:
    return [w["word"] for w in r["words"]]


def test_round_flow_and_review(client):
    stats = client.get("/api/english/stats").json()
    assert (stats["seen"], stats["due"], stats["streak"]) == (0, 0, 0)
    assert stats["total"] == len(WORDS)

    money = set(TOPIC_WORDS["money"])
    first, res = _play(client, 20_000, None, "money")
    assert first["topic"] == "money" and len(first["words"]) == api.PAIRS
    assert set(_words(first)) <= money  # cả lượt cùng một chủ đề
    ipa = {w: i for w, i, _ in WORDS}
    assert all(w["ipa"] == ipa[w["word"]] for w in first["words"])
    wrong_id = first["words"][2]["id"]
    assert all(w["new"] and w["correct"] and w["next_days"] == 1 for w in res["words"])

    # Lượt 2: toàn từ mới khác trong chủ đề; sai 2 lần một từ
    second = client.post("/api/english/match", json={"topic": "money"}).json()
    assert set(_words(second)) <= money and not set(_words(second)) & set(_words(first))
    bad = second["words"][0]["id"]
    _backdate(second["id"], 30)
    res = client.post(
        f"/api/english/match/{second['id']}/finish", json={"elapsed_ms": 15_000, "mistakes": {str(bad): 2}}
    ).json()
    assert (res["mistakes"], res["total_ms"]) == (2, 15_000 + 2 * api.PENALTY_MS)
    assert [w["next_days"] for w in res["words"] if not w["correct"]] == [0]

    # Lượt 3, tự chọn chủ đề: chủ đề có từ cần ôn được chọn, từ sai được ôn trước
    third = client.post("/api/english/match").json()
    assert third["topic"] == "money" and third["words"][0]["id"] == bad
    assert wrong_id not in [w["id"] for w in third["words"]]  # từ đúng hôm nay thì mai mới ôn

    stats = client.get("/api/english/stats").json()
    assert (stats["seen"], stats["due"], stats["streak"]) == (16, 1, 1)
    topics = {t["id"]: t for t in client.get("/api/english/topics").json()}
    assert [t for t, _ in TOPICS] == list(topics)
    assert (topics["money"]["total"], topics["money"]["seen"], topics["money"]["due"]) == (len(money), 16, 1)
    assert (topics["work"]["seen"], topics["work"]["due"]) == (0, 0)
    assert (topics["food"]["group"], topics["money"]["group"]) == ("Đời sống hằng ngày", "Đọc tin tức")


def test_auto_topic_and_validation(client):
    r = client.post("/api/english/match").json()  # chưa học gì: chủ đề còn nhiều từ mới nhất
    biggest = max(len(ws) for ws in TOPIC_WORDS.values())
    assert len(TOPIC_WORDS[r["topic"]]) == biggest and set(_words(r)) <= set(TOPIC_WORDS[r["topic"]])
    assert client.post("/api/english/match", json={"topic": "khong-co"}).status_code == 422
    small = min(TOPIC_WORDS, key=lambda t: len(TOPIC_WORDS[t]))  # chủ đề ít từ nhất vẫn đủ một lượt
    assert len(client.post("/api/english/match", json={"topic": small}).json()["words"]) == api.PAIRS


def test_due_tomorrow_comes_back(client):
    first, _ = _play(client, 10_000, None, "work")
    with SessionLocal() as s:  # giả như đã sang ngày hôm sau
        for p in s.query(EnglishProgress).filter(EnglishProgress.word_id.in_([w["id"] for w in first["words"]])):
            p.due -= timedelta(days=1)
        s.commit()
    again = client.post("/api/english/match").json()
    assert again["topic"] == "work"  # tự chọn: chủ đề có từ cần ôn
    ids = [w["id"] for w in again["words"]]
    keep = api.PAIRS - api.MIN_NEW  # đến hạn cả 8 từ: ôn 6 từ, chừa 2 chỗ cho từ mới
    assert set(ids[:keep]) <= {w["id"] for w in first["words"]}
    assert not set(_words(again)[keep:]) & set(_words(first)) and set(_words(again)) <= set(TOPIC_WORDS["work"])


def test_finish_checks(client):
    r = client.post("/api/english/match").json()
    url = f"/api/english/match/{r['id']}/finish"
    assert client.post(url, json={"elapsed_ms": 1000, "mistakes": {"999999": 1}}).status_code == 422
    # Vừa bắt đầu: báo 60 giây cũng chỉ tính theo thời gian thực
    res = client.post(url, json={"elapsed_ms": 60_000}).json()
    assert res["elapsed_ms"] <= 2000 and res["record"] and res["rank"] >= 1
    assert client.post(url, json={"elapsed_ms": 1000}).status_code == 409
    assert client.post("/api/english/match/999999/finish", json={"elapsed_ms": 1}).status_code == 404


def test_leaderboard_across_players(make_client):
    a = make_client("dung@example.com", "Dũng")
    b = make_client("em@example.com", "Em")
    _play(a, 30_000)
    _play(b, 20_000)
    _, slow = _play(b, 40_000)
    assert (slow["record"], slow["best_ms"]) == (False, 20_000)
    board = a.get("/api/english/leaderboard").json()
    mine = [(x["name"], x["total_ms"], x["rounds"], x["me"]) for x in board["top"] if x["name"] in ("Dũng", "Em")]
    assert mine == [("Em", 20_000, 2, False), ("Dũng", 30_000, 1, True)]
    assert board["mine"]["name"] == "Dũng"


def test_round_keeps_room_for_new_words(client):
    # Hai lượt sai hết (lượt 2: 6 từ ôn lại + 2 từ mới): 10 từ đến hạn ôn ngay hôm nay
    learned: set[str] = set()
    for _ in range(2):
        r = client.post("/api/english/match", json={"topic": "money"}).json()
        learned |= set(_words(r))
        _backdate(r["id"], 30)
        body = {"elapsed_ms": 20_000, "mistakes": {str(w["id"]): 1 for w in r["words"]}}
        assert client.post(f"/api/english/match/{r['id']}/finish", json=body).status_code == 200
    assert len(learned) == 10
    names = _words(client.post("/api/english/match", json={"topic": "money"}).json())
    assert not set(names[-api.MIN_NEW :]) & learned  # vẫn có từ mới
    assert set(names[: api.PAIRS - api.MIN_NEW]) <= learned  # còn lại là từ cần ôn
