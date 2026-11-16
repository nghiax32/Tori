import random
from datetime import timedelta

import pytest
from game import sudoku
from game.db import SessionLocal
from game.models import SudokuGame


@pytest.mark.parametrize("level", list(sudoku.LEVELS))
def test_generate_unique(level):
    for seed in range(3):
        puzzle, solution = sudoku.generate(level, random.Random(seed))
        assert sudoku.count_solutions(puzzle) == 1
        assert 81 - puzzle.count("0") == sudoku.LEVELS[level]
        assert all(p in ("0", s) for p, s in zip(puzzle, solution, strict=True))
        rows = [solution[r * 9 : r * 9 + 9] for r in range(9)]
        assert all(sorted(row) == list("123456789") for row in rows)


def _solution(game_id: int) -> str:
    with SessionLocal() as s:
        return s.get(SudokuGame, game_id).solution


def _backdate(game_id: int, seconds: int) -> None:
    """Giả như ván đã bắt đầu từ `seconds` giây trước."""
    with SessionLocal() as s:
        g = s.get(SudokuGame, game_id)
        g.started_at -= timedelta(seconds=seconds)
        s.commit()


def _play(c, level: str, seconds: int) -> dict:
    g = c.post("/api/sudoku/games", json={"level": level}).json()
    _backdate(g["id"], seconds + 5)
    r = c.post(f"/api/sudoku/games/{g['id']}/finish", json={"board": _solution(g["id"]), "elapsed": seconds})
    assert r.status_code == 200
    return r.json()


def test_requires_login(make_client):
    from fastapi.testclient import TestClient
    from game.main import app

    with TestClient(app) as anon:
        assert anon.get("/api/sudoku/current").status_code == 401
        assert anon.get("/api/sudoku/leaderboard").status_code == 401


def test_save_and_resume(client):
    assert client.get("/api/sudoku/current").json() is None
    g = client.post("/api/sudoku/games", json={"level": "medium"}).json()
    assert "solution" not in g
    assert g["board"] == g["puzzle"] and g["elapsed"] == 0

    i = g["puzzle"].index("0")
    board = g["puzzle"][:i] + "5" + g["puzzle"][i + 1 :]
    notes = [0] * 81
    notes[i + 1 if g["puzzle"][i + 1] == "0" else i] = 0b110
    _backdate(g["id"], 100)
    url = f"/api/sudoku/games/{g['id']}"
    assert client.patch(url, json={"board": board, "notes": notes, "elapsed": 42}).status_code == 204

    cur = client.get("/api/sudoku/current").json()
    assert (cur["id"], cur["board"], cur["notes"], cur["elapsed"]) == (g["id"], board, notes, 42)

    # Không được sửa ô cho sẵn
    j = next(k for k, ch in enumerate(g["puzzle"]) if ch != "0")
    bad = board[:j] + ("1" if board[j] != "1" else "2") + board[j + 1 :]
    assert client.patch(url, json={"board": bad, "notes": notes, "elapsed": 50}).status_code == 422

    # Ván mới bỏ ván dở
    g2 = client.post("/api/sudoku/games", json={"level": "easy"}).json()
    assert client.get("/api/sudoku/current").json()["id"] == g2["id"]
    assert client.patch(url, json={"board": board, "notes": notes, "elapsed": 50}).status_code == 404


def test_finish(client):
    g = client.post("/api/sudoku/games", json={"level": "easy"}).json()
    url = f"/api/sudoku/games/{g['id']}/finish"
    solution = _solution(g["id"])
    wrong = solution[:-2] + solution[-1] + solution[-2]
    if wrong == solution:
        wrong = solution[:-1] + str(int(solution[-1]) % 9 + 1)
    assert client.post(url, json={"board": wrong, "elapsed": 10}).status_code == 422

    # Ván vừa bắt đầu: báo 600 giây cũng chỉ được tính theo thời gian thực (~1 giây)
    r = client.post(url, json={"board": solution, "elapsed": 600}).json()
    assert r["seconds"] <= 2 and r["record"] is True and r["rank"] == 1
    assert client.post(url, json={"board": solution, "elapsed": 1}).status_code == 409
    assert client.get("/api/sudoku/current").json() is None


def test_leaderboard_across_players(make_client):
    a = make_client("an@example.com", "An")
    b = make_client("binh@example.com")
    level = "hard"

    assert _play(a, level, 300)["record"] is True
    first = _play(b, level, 200)
    assert (first["rank"], first["seconds"]) == (1, 200)
    slower = _play(a, level, 400)
    assert (slower["record"], slower["best"], slower["rank"]) == (False, 300, 2)
    faster = _play(a, level, 150)
    assert (faster["record"], faster["rank"]) == (True, 1)

    board = b.get("/api/sudoku/leaderboard", params={"level": level}).json()
    top = [(row["name"], row["seconds"], row["games"], row["me"]) for row in board["top"] if row["name"] in ("An", "binh")]
    assert top == [("An", 150, 3, False), ("binh", 200, 1, True)]
    assert board["mine"]["seconds"] == 200
    assert all("@" not in row["name"] for row in board["top"])  # không lộ email người khác

    # Mức khác: bảng riêng
    assert all(row["name"] not in ("An", "binh") for row in b.get("/api/sudoku/leaderboard").json()["top"])
    assert b.get("/api/sudoku/leaderboard").json()["mine"] is None


def test_same_email_same_player(make_client):
    a = make_client("Chi@Example.com", "Chi")
    _play(a, "medium", 100)
    again = make_client("chi@example.com", "Chi")  # đăng nhập lại (máy khác) cùng email
    assert again.get("/api/sudoku/leaderboard", params={"level": "medium"}).json()["mine"]["seconds"] == 100
