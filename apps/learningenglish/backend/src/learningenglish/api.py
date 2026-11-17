"""Kho từ, lịch ôn ngắt quãng (SM-2), Ghép cặp tính giờ, Nghe – chép, Điền vào câu."""

import random
import re
from datetime import date, datetime, timedelta
from typing import Annotated, Literal
from zoneinfo import ZoneInfo

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import case, delete, func, select
from sqlalchemy.orm import Session
from tori_core import get_settings

from learningenglish.levels import LEVELS
from learningenglish.models import EnglishDaily, EnglishProgress, EnglishRound, EnglishWord, User
from learningenglish.topics import TOPIC_GROUP, TOPICS
from learningenglish.users import SessionDep, UserDep, display_name, now

router = APIRouter(prefix="/api/english", tags=["english"])

PAIRS = 8  # số cặp mỗi lượt Ghép cặp
PRACTICE = 10  # số từ mỗi lượt Nghe – chép / Điền vào câu
CHOICES = 4  # số lựa chọn mỗi câu Điền vào câu
BLANK = "____"
MIN_NEW = 2  # mỗi lượt có ít nhất 2 từ mới (nếu kho còn), kể cả khi nhiều từ đến hạn ôn
PENALTY_MS = 3000  # mỗi lần ghép sai cộng 3 giây
LEARNED_REPS = 3  # đúng liên tiếp 3 lần (cách nhau ngày càng xa) thì coi là đã thuộc
LEADERBOARD_SIZE = 10


def today() -> date:
    return datetime.now(ZoneInfo(get_settings().timezone)).date()


def _local_date(utc_naive: datetime) -> date:
    tz = ZoneInfo(get_settings().timezone)
    return utc_naive.replace(tzinfo=ZoneInfo("UTC")).astimezone(tz).date()


# ---------- lịch ôn ----------


def review(p: EnglishProgress, correct: bool, day: date) -> None:
    """Cập nhật lịch ôn của một từ theo SM-2: đúng thì giãn khoảng cách (1, 3 ngày rồi nhân hệ số dễ),
    sai thì học lại từ đầu và ôn lại ngay trong ngày."""
    q = 4 if correct else 2
    p.ease = max(1.3, p.ease + 0.1 - (5 - q) * (0.08 + (5 - q) * 0.02))
    if correct:
        p.reps += 1
        p.correct += 1
        p.interval = 1 if p.reps == 1 else 3 if p.reps == 2 else round(p.interval * p.ease)
    else:
        p.reps = 0
        p.wrong += 1
        p.interval = 0
    p.due = day + timedelta(days=p.interval)
    p.last_seen = now()


def _pick_words(
    session: Session, user: User, day: date, topic: str, count: int = PAIRS, level: str | None = None
) -> list[EnglishWord]:
    """Từ cho một lượt, trong một chủ đề (và một trình độ, nếu chọn): từ đến hạn ôn trước nhưng chừa chỗ cho
    ít nhất MIN_NEW từ mới (nếu còn), từ mới lấy ngẫu nhiên; thiếu nữa thì lấy từ đã lâu chưa gặp.
    Chủ đề không đủ từ ở trình độ đã chọn thì lấy thêm từ cùng chủ đề ở trình độ khác cho đủ lượt."""
    words = _pick(session, user, day, topic, count, level, [])
    if level is not None and len(words) < count:
        words += _pick(session, user, day, topic, count - len(words), None, [w.id for w in words])
    return words


def _pick(
    session: Session, user: User, day: date, topic: str, count: int, level: str | None, exclude: list[int]
) -> list[EnglishWord]:
    where = [EnglishWord.topic == topic, EnglishWord.id.not_in(exclude)]
    if level is not None:
        where.append(EnglishWord.level == level)
    due = session.scalars(
        select(EnglishWord)
        .join(EnglishProgress, EnglishProgress.word_id == EnglishWord.id)
        .where(EnglishProgress.user_id == user.id, EnglishProgress.due <= day, *where)
        .order_by(EnglishProgress.due, EnglishProgress.last_seen)
        .limit(count)
    ).all()
    seen = select(EnglishProgress.word_id).where(EnglishProgress.user_id == user.id)
    new = session.scalars(
        select(EnglishWord).where(EnglishWord.id.not_in(seen), *where).order_by(func.random()).limit(count)
    ).all()
    words = list(due[: count - min(MIN_NEW, len(new))])
    words += new[: count - len(words)]
    words += [w for w in due if w not in words][: count - len(words)]  # hết từ mới: thêm từ đến hạn còn lại
    if len(words) < count:
        have = [w.id for w in words]
        words += session.scalars(
            select(EnglishWord)
            .join(EnglishProgress, EnglishProgress.word_id == EnglishWord.id)
            .where(EnglishProgress.user_id == user.id, EnglishWord.id.not_in(have), *where)
            .order_by(EnglishProgress.last_seen)
            .limit(count - len(words))
        ).all()
    return words


def _check_level(level: str | None) -> None:
    if level is not None and level not in dict(LEVELS):
        raise HTTPException(status_code=422, detail="Trình độ không hợp lệ")


def _topic_stats(
    session: Session, user: User, day: date, level: str | None = None
) -> dict[str, tuple[int, int, int]]:
    """Mỗi chủ đề: (tổng số từ, số từ đã học, số từ cần ôn hôm nay), chỉ tính từ ở trình độ `level` nếu có."""
    only = [EnglishWord.level == level] if level is not None else []
    total = dict(
        session.execute(select(EnglishWord.topic, func.count()).where(*only).group_by(EnglishWord.topic)).all()
    )
    rows = session.execute(
        select(EnglishWord.topic, func.count(), func.sum(case((EnglishProgress.due <= day, 1), else_=0)))
        .join(EnglishProgress, EnglishProgress.word_id == EnglishWord.id)
        .where(EnglishProgress.user_id == user.id, *only)
        .group_by(EnglishWord.topic)
    ).all()
    seen = {t: (n, int(d or 0)) for t, n, d in rows}
    return {t: (total.get(t, 0), *seen.get(t, (0, 0))) for t, _ in TOPICS}


def choose_topic(session: Session, user: User, day: date, topic: str | None, level: str | None = None) -> str:
    """Chủ đề cho lượt: chủ đề người dùng chọn; "tự chọn" (None) thì lấy chủ đề có nhiều từ cần ôn nhất,
    không có từ cần ôn thì chủ đề còn nhiều từ mới nhất (bằng nhau thì ngẫu nhiên); tính theo trình độ đã chọn."""
    _check_level(level)
    if topic is not None:
        if topic not in dict(TOPICS):
            raise HTTPException(status_code=422, detail="Chủ đề không hợp lệ")
        return topic
    stats = _topic_stats(session, user, day, level)
    order = list(stats)
    random.shuffle(order)
    return max(order, key=lambda t: (stats[t][2], stats[t][0] - stats[t][1]))


# ---------- API ----------


class WordOut(BaseModel):
    id: int
    word: str
    ipa: str
    meaning: str


class RoundOut(BaseModel):
    id: int
    topic: str
    words: list[WordOut]


class MatchIn(BaseModel):
    topic: str | None = None  # None: tự chọn chủ đề
    level: str | None = None  # None: mọi trình độ; "A2" / "B1" / "B2"


class TopicOut(BaseModel):
    id: str
    label: str
    group: str  # nhóm hiển thị: "Đời sống hằng ngày" / "Đọc tin tức"
    total: int
    seen: int
    due: int


class FinishIn(BaseModel):
    elapsed_ms: int = Field(ge=0)
    # số lần ghép sai của từng từ (theo id); từ không có trong đây là đúng ngay lần đầu
    mistakes: dict[int, Annotated[int, Field(ge=0, le=50)]] = {}


class ReviewedWord(BaseModel):
    word: str
    ipa: str
    meaning: str
    new: bool  # lần đầu học
    correct: bool
    next_days: int  # bao nhiêu ngày nữa ôn lại (0 = hôm nay)


class FinishOut(BaseModel):
    elapsed_ms: int
    mistakes: int
    total_ms: int
    best_ms: int
    record: bool
    rank: int
    words: list[ReviewedWord]


class StatsOut(BaseModel):
    total: int  # số từ trong kho
    seen: int  # đã học
    learned: int  # đã thuộc
    due: int  # cần ôn hôm nay
    streak: int  # số ngày liên tiếp có chơi (bất kỳ chế độ nào, tính đến hôm nay hoặc hôm qua)


class LeaderRow(BaseModel):
    rank: int
    name: str
    total_ms: int
    rounds: int
    me: bool


class LeaderboardOut(BaseModel):
    top: list[LeaderRow]
    mine: LeaderRow | None


def _leaderboard(session: Session, user: User) -> LeaderboardOut:
    best: dict[int, tuple[int, datetime]] = {}
    rounds: dict[int, int] = {}
    rows = session.execute(
        select(EnglishRound.user_id, EnglishRound.total_ms, EnglishRound.finished_at).where(
            EnglishRound.mode == "match", EnglishRound.finished_at.is_not(None)
        )
    )
    for user_id, total_ms, finished_at in rows:
        rounds[user_id] = rounds.get(user_id, 0) + 1
        if user_id not in best or (total_ms, finished_at) < best[user_id]:
            best[user_id] = (total_ms, finished_at)
    users = {u.id: u for u in session.scalars(select(User).where(User.id.in_(best)))}
    order = sorted(best, key=lambda uid: best[uid])
    table = [
        LeaderRow(
            rank=i + 1, name=display_name(users[uid]), total_ms=best[uid][0], rounds=rounds[uid], me=uid == user.id
        )
        for i, uid in enumerate(order)
    ]
    return LeaderboardOut(top=table[:LEADERBOARD_SIZE], mine=next((r for r in table if r.me), None))


def _drop_unfinished(session: Session, user: User, mode: str) -> None:
    session.execute(
        delete(EnglishRound).where(
            EnglishRound.user_id == user.id, EnglishRound.mode == mode, EnglishRound.finished_at.is_(None)
        )
    )


def _open_round(session: Session, user: User, round_id: int, modes: tuple[str, ...], word_ids: set[int]) -> EnglishRound:
    r = session.get(EnglishRound, round_id)
    if r is None or r.user_id != user.id or r.mode not in modes:
        raise HTTPException(status_code=404, detail="Không tìm thấy lượt chơi")
    if r.finished_at is not None:
        raise HTTPException(status_code=409, detail="Lượt này đã xong")
    if word_ids - set(r.word_ids):
        raise HTTPException(status_code=422, detail="Từ không thuộc lượt này")
    return r


def _apply_reviews(session: Session, user: User, word_ids: list[int], correct: dict[int, bool]) -> list[ReviewedWord]:
    """Cập nhật lịch ôn cho các từ đã làm trong lượt (`correct`: từ nào đúng); trả về tóm tắt từng từ."""
    day = today()
    words = {w.id: w for w in session.scalars(select(EnglishWord).where(EnglishWord.id.in_(word_ids)))}
    progress = {
        p.word_id: p
        for p in session.scalars(
            select(EnglishProgress).where(EnglishProgress.user_id == user.id, EnglishProgress.word_id.in_(word_ids))
        )
    }
    reviewed = []
    for wid in word_ids:
        if wid not in correct:
            continue
        new = wid not in progress
        if new:
            progress[wid] = EnglishProgress(
                user_id=user.id, word_id=wid, reps=0, ease=2.5, interval=0, correct=0, wrong=0, due=day
            )
            session.add(progress[wid])
        review(progress[wid], correct[wid], day)
        w = words[wid]
        reviewed.append(
            ReviewedWord(
                word=w.word, ipa=w.ipa, meaning=w.meaning, new=new, correct=correct[wid], next_days=progress[wid].interval
            )
        )
    return reviewed


@router.get("/stats")
def stats(user: UserDep, session: SessionDep) -> StatsOut:
    day = today()
    total = session.scalar(select(func.count()).select_from(EnglishWord)) or 0
    progress = session.scalars(select(EnglishProgress).where(EnglishProgress.user_id == user.id)).all()
    days = {
        _local_date(d)
        for d in session.scalars(
            select(EnglishRound.finished_at).where(
                EnglishRound.user_id == user.id, EnglishRound.finished_at.is_not(None)
            )
        )
    } | set(
        session.scalars(
            select(EnglishDaily.day).where(EnglishDaily.user_id == user.id, EnglishDaily.finished_at.is_not(None))
        )
    )
    streak = 0
    cursor = day if day in days else day - timedelta(days=1)
    while cursor in days:
        streak += 1
        cursor -= timedelta(days=1)
    return StatsOut(
        total=total,
        seen=len(progress),
        learned=sum(p.reps >= LEARNED_REPS for p in progress),
        due=sum(p.due <= day for p in progress),
        streak=streak,
    )


@router.get("/topics")
def topics(user: UserDep, session: SessionDep, level: str | None = None) -> list[TopicOut]:
    """Các chủ đề kèm tiến độ của người học (để chọn chủ đề trước khi chơi), tính theo trình độ nếu có."""
    _check_level(level)
    stats = _topic_stats(session, user, today(), level)
    return [
        TopicOut(id=t, label=label, group=TOPIC_GROUP[t], total=stats[t][0], seen=stats[t][1], due=stats[t][2])
        for t, label in TOPICS
    ]


@router.post("/match", status_code=201)
def new_round(user: UserDep, session: SessionDep, body: MatchIn | None = None) -> RoundOut:
    """Lượt Ghép cặp mới trong một chủ đề (lượt đang dở, nếu có, bị bỏ)."""
    _drop_unfinished(session, user, "match")
    day = today()
    body = body or MatchIn()
    topic = choose_topic(session, user, day, body.topic, body.level)
    words = _pick_words(session, user, day, topic, level=body.level)
    r = EnglishRound(user_id=user.id, mode="match", word_ids=[w.id for w in words], started_at=now())
    session.add(r)
    session.commit()
    return RoundOut(
        id=r.id, topic=topic, words=[WordOut(id=w.id, word=w.word, ipa=w.ipa, meaning=w.meaning) for w in words]
    )


@router.post("/match/{round_id}/finish")
def finish_round(round_id: int, body: FinishIn, user: UserDep, session: SessionDep) -> FinishOut:
    """Xong lượt: cập nhật lịch ôn từng từ, ghi thời gian (cộng phạt) vào bảng xếp hạng."""
    r = _open_round(session, user, round_id, ("match",), set(body.mistakes))
    prev_best = session.scalar(
        select(func.min(EnglishRound.total_ms)).where(
            EnglishRound.user_id == user.id, EnglishRound.mode == "match", EnglishRound.finished_at.is_not(None)
        )
    )
    reviewed = _apply_reviews(session, user, r.word_ids, {wid: body.mistakes.get(wid, 0) == 0 for wid in r.word_ids})

    # Thời gian trình duyệt báo không được vượt thời gian thực kể từ lúc bắt đầu lượt
    real_ms = int((now() - r.started_at).total_seconds() * 1000) + 1000
    r.elapsed_ms = max(1, min(body.elapsed_ms, real_ms))
    r.mistakes = sum(body.mistakes.values())
    r.total_ms = r.elapsed_ms + r.mistakes * PENALTY_MS
    r.finished_at = now()
    session.commit()

    board = _leaderboard(session, user)
    assert board.mine is not None
    return FinishOut(
        elapsed_ms=r.elapsed_ms,
        mistakes=r.mistakes,
        total_ms=r.total_ms,
        best_ms=board.mine.total_ms,
        record=prev_best is None or r.total_ms < prev_best,
        rank=board.mine.rank,
        words=reviewed,
    )


@router.get("/leaderboard")
def leaderboard(user: UserDep, session: SessionDep) -> LeaderboardOut:
    """Bảng xếp hạng chung: lượt Ghép cặp nhanh nhất (đã cộng phạt) của mỗi người."""
    return _leaderboard(session, user)


# ---------- Nghe – chép, Điền vào câu ----------


class PracticeIn(BaseModel):
    mode: Literal["listen", "fill"]
    topic: str | None = None  # None: tự chọn chủ đề
    level: str | None = None  # None: mọi trình độ; "A2" / "B1" / "B2"


class PracticeItem(BaseModel):
    id: int
    word: str
    ipa: str
    meaning: str
    sentence: str | None = None  # Điền vào câu: câu ví dụ với từ bị che bằng ____
    answer: str | None = None  # Điền vào câu: từ như viết trong câu (VD viết hoa đầu câu)
    choices: list[str] | None = None  # Điền vào câu: các lựa chọn (đã xáo, gồm đáp án)
    translation: str | None = None  # Điền vào câu: bản dịch tiếng Việt của câu, hiện sau khi chọn đáp án


class PracticeOut(BaseModel):
    id: int
    mode: Literal["listen", "fill"]
    topic: str
    items: list[PracticeItem]


class PracticeFinishIn(BaseModel):
    results: dict[int, bool]  # từ (theo id) -> làm đúng hay không; từ bỏ qua thì không gửi


class PracticeFinishOut(BaseModel):
    correct: int
    total: int
    words: list[ReviewedWord]


def blank_out(sentence: str, word: str) -> tuple[str, str] | None:
    """Che từ đầu tiên khớp `word` (không phân biệt hoa thường) trong câu: (câu đã che, từ như trong câu)."""
    m = re.search(rf"\b{re.escape(word)}\b", sentence, re.IGNORECASE)
    if not m:
        return None
    return sentence[: m.start()] + BLANK + sentence[m.end() :], m.group(0)


@router.post("/practice", status_code=201)
def new_practice(body: PracticeIn, user: UserDep, session: SessionDep) -> PracticeOut:
    """Lượt Nghe – chép hoặc Điền vào câu: 10 từ trong một chủ đề theo lịch ôn (từ đến hạn trước, chừa chỗ cho từ mới).
    Lựa chọn nhiễu của Điền vào câu lấy trong cùng chủ đề, để không đoán được nhờ khác chủ đề."""
    _drop_unfinished(session, user, body.mode)
    day = today()
    topic = choose_topic(session, user, day, body.topic, body.level)
    words = _pick_words(session, user, day, topic, PRACTICE, body.level)
    if body.mode == "fill":
        words = [w for w in words if blank_out(w.example, w.word)]
    pool = session.scalars(select(EnglishWord.word).where(EnglishWord.topic == topic)).all()
    items = []
    for w in words:
        item = PracticeItem(id=w.id, word=w.word, ipa=w.ipa, meaning=w.meaning)
        if body.mode == "fill":
            item.sentence, item.answer = blank_out(w.example, w.word)  # type: ignore[misc]
            others = random.sample([x for x in pool if x != w.word], min(CHOICES - 1, len(pool) - 1))
            item.choices = random.sample([w.word, *others], CHOICES)
            item.translation = w.example_vi or None
        items.append(item)
    r = EnglishRound(user_id=user.id, mode=body.mode, word_ids=[w.id for w in words], started_at=now())
    session.add(r)
    session.commit()
    return PracticeOut(id=r.id, mode=body.mode, topic=topic, items=items)


@router.post("/practice/{round_id}/finish")
def finish_practice(round_id: int, body: PracticeFinishIn, user: UserDep, session: SessionDep) -> PracticeFinishOut:
    """Xong lượt luyện tập: cập nhật lịch ôn các từ đã làm (không có bảng xếp hạng)."""
    r = _open_round(session, user, round_id, ("listen", "fill"), set(body.results))
    reviewed = _apply_reviews(session, user, r.word_ids, body.results)
    r.mistakes = sum(not ok for ok in body.results.values())
    r.elapsed_ms = int((now() - r.started_at).total_seconds() * 1000)
    r.finished_at = now()
    session.commit()
    return PracticeFinishOut(correct=sum(body.results.values()), total=len(body.results), words=reviewed)
