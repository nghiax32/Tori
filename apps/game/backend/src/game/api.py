from datetime import UTC, datetime
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field
from sqlalchemy import delete, select
from sqlalchemy.orm import Session
from tori_core import Identity, get_identity

from game import sudoku
from game.db import SessionLocal, get_session
from game.models import SudokuGame, User

router = APIRouter(prefix="/api", tags=["game"])
SessionDep = Annotated[Session, Depends(get_session)]
Level = Literal["easy", "medium", "hard"]
LEADERBOARD_SIZE = 10


def _now() -> datetime:
    return datetime.now(UTC).replace(tzinfo=None)


# ---------- người dùng ----------


def _upsert_user(session: Session, identity: Identity, *, login: bool) -> User:
    email = identity.email.strip().lower()
    user = session.scalar(select(User).where(User.email == email))
    if user is None:
        user = User(email=email)
        session.add(user)
    user.name = identity.name
    if login:
        user.last_login_at = _now()
    session.flush()
    return user


def record_login(identity: Identity) -> None:
    """Callback cho tori_core.build_auth_router: lưu người chơi khi đăng nhập."""
    with SessionLocal() as session:
        _upsert_user(session, identity, login=True)
        session.commit()


def current_user(request: Request, session: SessionDep) -> User:
    identity = get_identity(request)
    user = session.scalar(select(User).where(User.email == identity.email.strip().lower()))
    if user is None:  # VD DB vừa bị xoá nhưng cookie vẫn còn
        user = _upsert_user(session, identity, login=False)
        session.commit()
    return user


UserDep = Annotated[User, Depends(current_user)]


def _display_name(user: User) -> str:
    return user.name or user.email.split("@")[0]


# ---------- Sudoku ----------

Board = Annotated[str, Field(pattern=r"^[0-9]{81}$")]


class GameOut(BaseModel):
    id: int
    level: Level
    puzzle: str
    board: str
    notes: list[int]
    elapsed: int


class NewGameIn(BaseModel):
    level: Level = "easy"


class ProgressIn(BaseModel):
    board: Board
    notes: list[Annotated[int, Field(ge=0, le=0b1111111110)]] = Field(min_length=81, max_length=81)
    elapsed: int = Field(ge=0)


class FinishIn(BaseModel):
    board: Board
    elapsed: int = Field(ge=0)


class FinishOut(BaseModel):
    seconds: int
    best: int
    record: bool  # kỷ lục mới của bản thân ở mức này
    rank: int


class LeaderRow(BaseModel):
    rank: int
    name: str
    seconds: int
    games: int
    me: bool


class LeaderboardOut(BaseModel):
    level: Level
    top: list[LeaderRow]
    mine: LeaderRow | None


def _game_out(g: SudokuGame) -> GameOut:
    return GameOut(id=g.id, level=g.level, puzzle=g.puzzle, board=g.board, notes=g.notes, elapsed=g.elapsed)


def _open_game(session: Session, user: User, game_id: int) -> SudokuGame:
    g = session.get(SudokuGame, game_id)
    if g is None or g.user_id != user.id:
        raise HTTPException(status_code=404, detail="Không tìm thấy ván chơi")
    if g.finished_at is not None:
        raise HTTPException(status_code=409, detail="Ván này đã xong")
    return g


def _check_board(g: SudokuGame, board: str) -> None:
    if any(p != "0" and b != p for p, b in zip(g.puzzle, board, strict=True)):
        raise HTTPException(status_code=422, detail="Không được sửa ô cho sẵn")


def _clamp_elapsed(g: SudokuGame, elapsed: int) -> int:
    """Thời gian trình duyệt báo không được vượt thời gian thực kể từ lúc bắt đầu ván."""
    return min(elapsed, int((_now() - g.started_at).total_seconds()) + 1)


def _ranking(session: Session, level: str) -> tuple[list[LeaderRow], list[int]]:
    """Mỗi người một dòng: thời gian nhanh nhất ở mức này; bằng nhau thì ai đạt trước xếp trên."""
    best: dict[int, tuple[int, datetime]] = {}
    games: dict[int, int] = {}
    rows = session.execute(
        select(SudokuGame.user_id, SudokuGame.seconds, SudokuGame.finished_at).where(
            SudokuGame.level == level, SudokuGame.finished_at.is_not(None)
        )
    )
    for user_id, seconds, finished_at in rows:
        games[user_id] = games.get(user_id, 0) + 1
        if user_id not in best or (seconds, finished_at) < best[user_id]:
            best[user_id] = (seconds, finished_at)
    users = {u.id: u for u in session.scalars(select(User).where(User.id.in_(best)))}
    order = sorted(best, key=lambda uid: best[uid])
    return [
        LeaderRow(rank=i + 1, name=_display_name(users[uid]), seconds=best[uid][0], games=games[uid], me=False)
        for i, uid in enumerate(order)
    ], order


def _leaderboard(session: Session, user: User, level: str) -> LeaderboardOut:
    rows, order = _ranking(session, level)
    mine = None
    for row, uid in zip(rows, order, strict=True):
        row.me = uid == user.id
        if row.me:
            mine = row
    return LeaderboardOut(level=level, top=rows[:LEADERBOARD_SIZE], mine=mine)


@router.get("/sudoku/current")
def current_game(user: UserDep, session: SessionDep) -> GameOut | None:
    """Ván đang chơi dở (nếu có)."""
    g = session.scalar(
        select(SudokuGame)
        .where(SudokuGame.user_id == user.id, SudokuGame.finished_at.is_(None))
        .order_by(SudokuGame.id.desc())
    )
    return _game_out(g) if g else None


@router.post("/sudoku/games", status_code=201)
def new_game(body: NewGameIn, user: UserDep, session: SessionDep) -> GameOut:
    """Ván mới. Ván đang chơi dở (nếu có) bị bỏ."""
    session.execute(delete(SudokuGame).where(SudokuGame.user_id == user.id, SudokuGame.finished_at.is_(None)))
    puzzle, solution = sudoku.generate(body.level)
    g = SudokuGame(
        user_id=user.id,
        level=body.level,
        puzzle=puzzle,
        solution=solution,
        board=puzzle,
        notes=[0] * 81,
        started_at=_now(),
    )
    session.add(g)
    session.commit()
    return _game_out(g)


@router.patch("/sudoku/games/{game_id}", status_code=204)
def save_progress(game_id: int, body: ProgressIn, user: UserDep, session: SessionDep) -> None:
    """Lưu ván đang chơi (để chơi tiếp sau, trên máy khác cũng được)."""
    g = _open_game(session, user, game_id)
    _check_board(g, body.board)
    g.board = body.board
    g.notes = body.notes
    g.elapsed = max(g.elapsed, _clamp_elapsed(g, body.elapsed))
    session.commit()


@router.post("/sudoku/games/{game_id}/finish")
def finish_game(game_id: int, body: FinishIn, user: UserDep, session: SessionDep) -> FinishOut:
    """Nộp lời giải. Đúng thì ghi thời gian vào bảng xếp hạng."""
    g = _open_game(session, user, game_id)
    _check_board(g, body.board)
    if body.board != g.solution:
        raise HTTPException(status_code=422, detail="Lời giải chưa đúng")
    prev_best = session.scalar(
        select(SudokuGame.seconds)
        .where(SudokuGame.user_id == user.id, SudokuGame.level == g.level, SudokuGame.finished_at.is_not(None))
        .order_by(SudokuGame.seconds)
    )
    g.board = body.board
    g.seconds = g.elapsed = max(1, _clamp_elapsed(g, body.elapsed))
    g.finished_at = _now()
    session.commit()
    mine = _leaderboard(session, user, g.level).mine
    assert mine is not None
    return FinishOut(
        seconds=g.seconds, best=mine.seconds, record=prev_best is None or g.seconds < prev_best, rank=mine.rank
    )


@router.get("/sudoku/leaderboard")
def leaderboard(user: UserDep, session: SessionDep, level: Level = "easy") -> LeaderboardOut:
    """Bảng xếp hạng chung của mọi người chơi: thời gian giải nhanh nhất của mỗi người."""
    return _leaderboard(session, user, level)
