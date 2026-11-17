"""Từ của ngày: mỗi ngày một từ tiếng Anh 5 chữ cái, ai cũng đoán cùng một từ, tối đa 6 lượt.
Đáp án chỉ nằm ở server; mỗi lượt đoán server trả về gợi ý màu cho từng chữ."""

import random
from datetime import date, datetime, timedelta

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from learningenglish.api import LEADERBOARD_SIZE, today
from learningenglish.daily_words import DAILY_WORDS
from learningenglish.models import EnglishDaily, EnglishDailyAnswer, User
from learningenglish.users import SessionDep, UserDep, display_name, now

router = APIRouter(prefix="/api/english/daily", tags=["english"])

LENGTH = 5
MAX_GUESSES = 6


def answer_for(session: Session, day: date) -> EnglishDailyAnswer:
    """Từ của ngày `day`: chọn ngẫu nhiên lần đầu (tránh các từ đã dùng gần đây) rồi lưu lại."""
    a = session.get(EnglishDailyAnswer, day)
    if a is not None:
        return a
    recent = set(
        session.scalars(
            select(EnglishDailyAnswer.word).where(
                EnglishDailyAnswer.day >= day - timedelta(days=len(DAILY_WORDS) - 1), EnglishDailyAnswer.day < day
            )
        )
    )
    word, ipa, meaning = random.choice([w for w in DAILY_WORDS if w[0] not in recent] or DAILY_WORDS)
    session.add(EnglishDailyAnswer(day=day, word=word, ipa=ipa, meaning=meaning))
    try:
        session.commit()
    except IntegrityError:  # người khác vừa chọn cùng lúc: dùng từ đã lưu
        session.rollback()
    return session.get(EnglishDailyAnswer, day)  # type: ignore[return-value]


def marks(guess: str, answer: str) -> str:
    """Gợi ý cho từng chữ: "g" đúng chữ đúng chỗ, "y" có trong từ nhưng sai chỗ, "." không có
    (chữ lặp lại chỉ được tô vàng tối đa bằng số lần nó còn lại trong đáp án)."""
    result = ["."] * LENGTH
    left: dict[str, int] = {}
    for i, (g, a) in enumerate(zip(guess, answer, strict=True)):
        if g == a:
            result[i] = "g"
        else:
            left[a] = left.get(a, 0) + 1
    for i, g in enumerate(guess):
        if result[i] == "." and left.get(g, 0) > 0:
            result[i] = "y"
            left[g] -= 1
    return "".join(result)


class Guess(BaseModel):
    word: str
    marks: str


class Answer(BaseModel):
    word: str
    ipa: str
    meaning: str


class DailyOut(BaseModel):
    day: date
    length: int = LENGTH
    max_guesses: int = MAX_GUESSES
    guesses: list[Guess]
    solved: bool
    over: bool
    seconds: int | None
    answer: Answer | None  # chỉ có khi đã xong lượt (đoán đúng hoặc hết lượt)


class GuessIn(BaseModel):
    guess: str = Field(min_length=LENGTH, max_length=LENGTH)


class DailyRow(BaseModel):
    rank: int
    name: str
    guesses: int
    seconds: int
    me: bool


class DailyBoardOut(BaseModel):
    top: list[DailyRow]
    mine: DailyRow | None


def _state(session: Session, user: User, day: date) -> EnglishDaily:
    d = session.get(EnglishDaily, (user.id, day))
    if d is None:
        d = EnglishDaily(user_id=user.id, day=day, guesses=[], solved=False)
        session.add(d)
    return d


def _out(d: EnglishDaily, a: EnglishDailyAnswer) -> DailyOut:
    over = d.solved or len(d.guesses) >= MAX_GUESSES
    return DailyOut(
        day=d.day,
        guesses=[Guess(word=g, marks=marks(g, a.word)) for g in d.guesses],
        solved=d.solved,
        over=over,
        seconds=d.seconds,
        answer=Answer(word=a.word, ipa=a.ipa, meaning=a.meaning) if over else None,
    )


@router.get("")
def daily(user: UserDep, session: SessionDep) -> DailyOut:
    day = today()
    a = answer_for(session, day)
    d = session.get(EnglishDaily, (user.id, day)) or EnglishDaily(user_id=user.id, day=day, guesses=[], solved=False)
    return _out(d, a)


@router.post("/guess")
def guess(body: GuessIn, user: UserDep, session: SessionDep) -> DailyOut:
    day = today()
    a = answer_for(session, day)
    word = body.guess.strip().lower()
    if len(word) != LENGTH or not word.isascii() or not word.isalpha():
        raise HTTPException(status_code=422, detail=f"Cần đúng {LENGTH} chữ cái tiếng Anh")
    d = _state(session, user, day)
    if d.solved or len(d.guesses) >= MAX_GUESSES:
        raise HTTPException(status_code=409, detail="Hôm nay bạn đã chơi xong, mai quay lại nhé")
    t = now()
    if d.first_guess_at is None:
        d.first_guess_at = t
    d.guesses = [*d.guesses, word]
    if word == a.word:
        d.solved = True
        d.seconds = max(1, int((t - d.first_guess_at).total_seconds()))
    if d.solved or len(d.guesses) >= MAX_GUESSES:
        d.finished_at = t
    session.commit()
    return _out(d, a)


@router.get("/leaderboard")
def daily_leaderboard(user: UserDep, session: SessionDep) -> DailyBoardOut:
    """Những người đã đoán đúng hôm nay: ít lượt hơn xếp trên, bằng lượt thì nhanh hơn xếp trên."""
    rows = session.scalars(select(EnglishDaily).where(EnglishDaily.day == today(), EnglishDaily.solved)).all()
    order = sorted(rows, key=lambda d: (len(d.guesses), d.seconds or 0, d.finished_at or datetime.max))
    users = {u.id: u for u in session.scalars(select(User).where(User.id.in_([d.user_id for d in rows])))}
    table = [
        DailyRow(
            rank=i + 1,
            name=display_name(users[d.user_id]),
            guesses=len(d.guesses),
            seconds=d.seconds or 0,
            me=d.user_id == user.id,
        )
        for i, d in enumerate(order)
    ]
    return DailyBoardOut(top=table[:LEADERBOARD_SIZE], mine=next((r for r in table if r.me), None))
