from collections import Counter
from datetime import timedelta

import pytest
from learningenglish import api, daily
from learningenglish.daily_words import DAILY_WORDS
from learningenglish.db import SessionLocal
from learningenglish.examples import EXAMPLES, TRANSLATIONS
from learningenglish.topics import TOPIC_WORDS, TOPICS
from learningenglish.words import WORDS


def test_every_word_has_one_topic():
    words = [w for w, _, _ in WORDS]
    in_topics = [w for ws in TOPIC_WORDS.values() for w in ws]
    assert sorted(in_topics) == sorted(words)  # mỗi từ đúng một chủ đề
    assert set(TOPIC_WORDS) == {t for t, _ in TOPICS}
    assert all(len(ws) >= api.PRACTICE for ws in TOPIC_WORDS.values())  # chủ đề nào cũng đủ một lượt


def test_every_word_has_a_fill_sentence():
    assert set(EXAMPLES) == set(TRANSLATIONS) == {w for w, _, _ in WORDS}
    assert all(TRANSLATIONS[w].strip() for w in TRANSLATIONS)
    for word, _, _ in WORDS:
        blanked = api.blank_out(EXAMPLES[word], word)
        assert blanked and api.BLANK in blanked[0], word
    assert api.blank_out("Inflation reached a peak.", "inflation") == ("____ reached a peak.", "Inflation")


def test_daily_words_are_valid():
    words = [w for w, _, _ in DAILY_WORDS]
    assert len(words) >= 90 and len(set(words)) == len(words)
    assert all(len(w) == 5 and w.isascii() and w.isalpha() and w.islower() for w in words)
    assert all(ipa.startswith("/") and meaning for _, ipa, meaning in DAILY_WORDS)


# ---------- Nghe – chép, Điền vào câu ----------


def test_fill_round(client):
    r = client.post("/api/english/practice", json={"mode": "fill", "topic": "conflict"}).json()
    assert (r["mode"], r["topic"]) == ("fill", "conflict") and len(r["items"]) == api.PRACTICE
    for item in r["items"]:
        assert set(item["choices"]) <= set(TOPIC_WORDS["conflict"])  # lựa chọn nhiễu cùng chủ đề
        assert api.BLANK in item["sentence"] and item["answer"].lower() == item["word"]
        assert len(item["choices"]) == api.CHOICES == len(set(item["choices"])) and item["word"] in item["choices"]
        assert item["translation"] == TRANSLATIONS[item["word"]]

    first, second = r["items"][0], r["items"][1]
    url = f"/api/english/practice/{r['id']}/finish"
    assert client.post(url, json={"results": {"999999": True}}).status_code == 422
    res = client.post(url, json={"results": {str(first["id"]): True, str(second["id"]): False}}).json()
    assert (res["correct"], res["total"]) == (1, 2)
    assert [(w["word"], w["correct"], w["next_days"]) for w in res["words"]] == [
        (first["word"], True, 1),
        (second["word"], False, 0),
    ]
    assert client.post(url, json={"results": {}}).status_code == 409

    # Lịch ôn dùng chung giữa các chế độ: từ sai ở Điền vào câu được ôn trước ở Ghép cặp
    match = client.post("/api/english/match").json()
    assert match["words"][0]["id"] == second["id"]
    stats = client.get("/api/english/stats").json()
    assert (stats["seen"], stats["due"], stats["streak"]) == (2, 1, 1)


def test_listen_round_and_modes_are_separate(client):
    r = client.post("/api/english/practice", json={"mode": "listen"}).json()
    assert r["mode"] == "listen" and len(r["items"]) == api.PRACTICE
    assert all(item["sentence"] is None and item["choices"] is None for item in r["items"])
    # Lượt Ghép cặp không nộp qua API luyện tập và ngược lại
    match = client.post("/api/english/match").json()
    assert client.post(f"/api/english/practice/{match['id']}/finish", json={"results": {}}).status_code == 404
    assert client.post(f"/api/english/match/{r['id']}/finish", json={"elapsed_ms": 1}).status_code == 404
    # Mở lượt Ghép cặp không xoá lượt Nghe – chép đang dở
    res = client.post(
        f"/api/english/practice/{r['id']}/finish", json={"results": {str(i["id"]): True for i in r["items"]}}
    )
    assert res.status_code == 200 and res.json()["correct"] == api.PRACTICE
    # Lượt luyện tập không vào bảng xếp hạng Ghép cặp
    assert client.get("/api/english/leaderboard").json()["mine"] is None


# ---------- Từ của ngày ----------


@pytest.mark.parametrize(
    ("guess", "answer", "expected"),
    [
        ("crane", "crane", "ggggg"),
        ("trace", "crane", ".ggyg"),
        ("speed", "abide", "..y.y"),  # chữ e thứ hai không được tô vì đáp án chỉ có một chữ e
        ("eerie", "there", "y.y.g"),
        ("xxxxx", "crane", "....."),
    ],
)
def test_marks(guess, answer, expected):
    assert daily.marks(guess, answer) == expected


def _answer() -> str:
    with SessionLocal() as s:
        return daily.answer_for(s, api.today()).word


def _wrong(answer: str) -> str:
    return "zzzzz" if answer != "zzzzz" else "yyyyy"


def test_daily_flow(make_client):
    a = make_client("giang@example.com", "Giang")
    state = a.get("/api/english/daily").json()
    assert (state["guesses"], state["solved"], state["over"], state["answer"]) == ([], False, False, None)
    answer = _answer()
    assert answer in {w for w, _, _ in DAILY_WORDS}
    assert _answer() == answer  # cố định trong ngày

    assert a.post("/api/english/daily/guess", json={"guess": "ab1de"}).status_code == 422
    assert a.post("/api/english/daily/guess", json={"guess": "abcd"}).status_code == 422
    state = a.post("/api/english/daily/guess", json={"guess": _wrong(answer).upper()}).json()
    assert state["guesses"][0]["word"] == _wrong(answer) and state["answer"] is None

    state = a.post("/api/english/daily/guess", json={"guess": answer}).json()
    assert (state["solved"], state["over"], state["guesses"][-1]["marks"]) == (True, True, "ggggg")
    assert state["answer"]["word"] == answer and state["answer"]["meaning"]
    assert a.post("/api/english/daily/guess", json={"guess": answer}).status_code == 409

    # Người thứ hai: cùng đáp án, đúng ngay lượt đầu -> xếp trên
    b = make_client("hai@example.com", "Hải")
    b.post("/api/english/daily/guess", json={"guess": answer})
    board = a.get("/api/english/daily/leaderboard").json()
    names = [(r["name"], r["guesses"]) for r in board["top"] if r["name"] in ("Giang", "Hải")]
    assert names == [("Hải", 1), ("Giang", 2)]
    assert board["mine"]["name"] == "Giang"
    assert a.get("/api/english/stats").json()["streak"] == 1


def test_daily_out_of_guesses(make_client):
    c = make_client()
    answer = _answer()
    for _ in range(daily.MAX_GUESSES):
        state = c.post("/api/english/daily/guess", json={"guess": _wrong(answer)}).json()
    assert (state["solved"], state["over"], state["answer"]["word"]) == (False, True, answer)
    assert c.post("/api/english/daily/guess", json={"guess": answer}).status_code == 409
    assert c.get("/api/english/daily/leaderboard").json()["mine"] is None


def test_daily_answer_avoids_recent_words():
    with SessionLocal() as s:
        day = api.today() + timedelta(days=1000)  # vùng ngày chưa dùng trong test khác
        used = [daily.answer_for(s, day + timedelta(days=i)).word for i in range(len(DAILY_WORDS))]
    assert len(set(used)) == len(DAILY_WORDS)  # hết một vòng mới lặp lại



# ---------- trình độ ----------


def test_every_word_has_a_level():
    from learningenglish.levels import LEVELS, level_of

    levels = Counter(level_of(w) for w, _, _ in WORDS)
    assert set(levels) <= {code for code, _ in LEVELS}
    assert all(levels[code] >= 200 for code, _ in LEVELS)  # mức nào cũng đủ nhiều từ
    assert (level_of("bag"), level_of("haggle"), level_of("election"), level_of("bureaucracy")) == (
        "A2",
        "B2",
        "B1",
        "B2",
    )


def test_round_by_level(client):
    from learningenglish.levels import level_of

    r = client.post("/api/english/match", json={"topic": "food", "level": "A2"}).json()
    assert len(r["words"]) == api.PAIRS and all(level_of(w["word"]) == "A2" for w in r["words"])
    p = client.post("/api/english/practice", json={"mode": "listen", "topic": "talk", "level": "B1"}).json()
    assert all(level_of(i["word"]) == "B1" for i in p["items"])

    # Chủ đề không có từ Nâng cao: vẫn đủ lượt, lấy thêm từ trình độ khác cùng chủ đề
    assert not any(level_of(w) == "B2" for w in TOPIC_WORDS["produce"])
    r = client.post("/api/english/match", json={"topic": "produce", "level": "B2"}).json()
    assert len(r["words"]) == api.PAIRS and {w["word"] for w in r["words"]} <= set(TOPIC_WORDS["produce"])

    assert client.post("/api/english/match", json={"level": "C1"}).status_code == 422
    assert client.get("/api/english/topics", params={"level": "C1"}).status_code == 422


def test_topic_counts_by_level(client):
    from learningenglish.levels import level_of

    food = {t["id"]: t for t in client.get("/api/english/topics", params={"level": "A2"}).json()}["food"]
    assert food["total"] == sum(level_of(w) == "A2" for w in TOPIC_WORDS["food"])
    client.post("/api/english/match", json={"topic": "food", "level": "A2"})  # chưa nộp: chưa tính đã học
    every = {t["id"]: t for t in client.get("/api/english/topics").json()}["food"]
    assert every["total"] == len(TOPIC_WORDS["food"])
