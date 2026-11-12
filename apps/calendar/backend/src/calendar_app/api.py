from datetime import date, datetime, timedelta
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, Request, Response
from sqlalchemy import func, select
from sqlalchemy.orm import Session
from tori_core import Identity, get_identity

from calendar_app import generator
from calendar_app.db import SessionLocal, get_session
from calendar_app.holidays import holidays_on
from calendar_app.lunar import LunarDate, lunar_to_solar, solar_to_lunar
from calendar_app.models import Event, Occurrence, User
from calendar_app.schemas import (
    CreateResult,
    EventCreate,
    EventOut,
    EventUpdate,
    HolidayOut,
    LunarDayOut,
    OccurrenceCreate,
    OccurrenceOut,
    OccurrenceUpdate,
    RuleIn,
)
from calendar_app.text import clean_title, normalize_title

router = APIRouter(prefix="/api", tags=["calendar"])
SessionDep = Annotated[Session, Depends(get_session)]


# ---------- người dùng ----------


def _upsert_user(session: Session, identity: Identity, *, login: bool) -> User:
    user = session.scalar(select(User).where(User.google_sub == identity.sub))
    if user is None:
        user = User(google_sub=identity.sub, email=identity.email)
        session.add(user)
    user.email = identity.email
    user.name = identity.name
    user.avatar_url = identity.picture
    if login:
        user.last_login_at = datetime.now()
    session.flush()
    return user


def record_login(identity: Identity) -> None:
    """Callback cho tori_core.build_auth_router: lưu người dùng khi đăng nhập."""
    with SessionLocal() as session:
        _upsert_user(session, identity, login=True)
        session.commit()


def current_user(request: Request, session: SessionDep) -> User:
    identity = get_identity(request)
    user = session.scalar(select(User).where(User.google_sub == identity.sub))
    if user is None:  # VD DB vừa bị xoá nhưng cookie vẫn còn
        user = _upsert_user(session, identity, login=False)
        session.commit()
    return user


UserDep = Annotated[User, Depends(current_user)]


# ---------- chuyển đổi ra JSON ----------


def _lunar_label(event: Event) -> str | None:
    if event.calendar != "lunar" or not event.rule_month or not event.rule_day:
        return None
    return LunarDate(event.rule_day, event.rule_month, 0, event.rule_leap).label()


def _event_out(session: Session, event: Event) -> EventOut:
    count, last = session.execute(
        select(func.count(Occurrence.id), func.max(Occurrence.start_date)).where(Occurrence.event_id == event.id)
    ).one()
    return EventOut(
        id=event.id,
        title=event.title,
        kind=event.kind,
        category=event.category,
        note=event.note,
        calendar=event.calendar,
        rule_month=event.rule_month,
        rule_day=event.rule_day,
        rule_leap=event.rule_leap,
        rule_year=event.rule_year,
        archived=event.archived_at is not None,
        occurrence_count=count,
        last_date=last,
        lunar_label=_lunar_label(event),
    )


def _occ_out(occ: Occurrence) -> OccurrenceOut:
    e = occ.event
    return OccurrenceOut(
        id=occ.id,
        event_id=e.id,
        title=e.title,
        kind=e.kind,
        category=e.category,
        start_date=occ.start_date,
        end_date=occ.end_date,
        note=occ.note,
        lunar_label=_lunar_label(e),
    )


def _annual_out(event: Event, d: date) -> OccurrenceOut:
    return OccurrenceOut(
        id=None,
        event_id=event.id,
        title=event.title,
        kind=event.kind,
        category=event.category,
        start_date=d,
        end_date=d,
        note=event.note,
        lunar_label=_lunar_label(event),
    )


# ---------- tiện ích ----------


def _get_event(session: Session, user: User, event_id: int) -> Event:
    event = session.get(Event, event_id)
    if event is None or event.user_id != user.id:
        raise HTTPException(status_code=404, detail="Không tìm thấy sự kiện")
    return event


def _get_occurrence(session: Session, user: User, occ_id: int) -> Occurrence:
    occ = session.get(Occurrence, occ_id)
    if occ is None or occ.event.user_id != user.id:
        raise HTTPException(status_code=404, detail="Không tìm thấy lần xảy ra")
    return occ


def _resolve_rule(rule: RuleIn) -> tuple[str, int, int, bool, int | None]:
    if rule.calendar is None:
        raise HTTPException(status_code=422, detail="Sự kiện thường niên cần chọn lịch dương hoặc âm")
    month, day, leap, year = rule.rule_month, rule.rule_day, rule.rule_leap, rule.rule_year
    if month is None or day is None:
        raise HTTPException(status_code=422, detail="Cần nhập ngày/tháng")
    if rule.calendar == "solar":
        try:
            date(year or 2000, month, day)  # 2000 là năm nhuận nên 29/2 hợp lệ khi không có năm
        except ValueError:
            raise HTTPException(status_code=422, detail="Ngày/tháng dương lịch không hợp lệ") from None
        return "solar", month, day, False, year
    if day > 30:
        raise HTTPException(status_code=422, detail="Ngày âm lịch chỉ từ 1 đến 30")
    if year and lunar_to_solar(day, month, year, leap) is None:
        label = LunarDate(day, month, year, leap).label()
        raise HTTPException(status_code=422, detail=f"Năm {year} không có ngày {label}")
    return "lunar", month, day, leap, year


def _check_title_free(session: Session, user: User, norm: str, exclude_id: int | None = None) -> None:
    other = session.scalar(select(Event).where(Event.user_id == user.id, Event.title_norm == norm))
    if other is not None and other.id != exclude_id:
        raise HTTPException(
            status_code=409, detail={"message": f"Đã có sự kiện “{other.title}”", "event_id": other.id}
        )


def _add_occurrence(
    session: Session, event: Event, start: date | None, end: date | None, note: str | None
) -> Occurrence:
    if event.kind != "occasional":
        raise HTTPException(status_code=409, detail="Sự kiện thường niên tự lặp lại mỗi năm, không thêm lần riêng")
    if start is None:
        raise HTTPException(status_code=422, detail="Cần nhập ngày bắt đầu")
    end = end or start
    if end < start:
        raise HTTPException(status_code=422, detail="Ngày kết thúc phải sau ngày bắt đầu")
    occ = Occurrence(event=event, start_date=start, end_date=end, note=note)
    session.add(occ)
    session.flush()
    return occ


# ---------- sự kiện ----------


@router.get("/events")
def list_events(
    user: UserDep,
    session: SessionDep,
    q: str = "",
    limit: Annotated[int, Query(ge=1, le=200)] = 50,
    include_archived: bool = False,
) -> list[EventOut]:
    """Danh sách sự kiện, dùng gần đây nhất xếp trước. `q` khớp không dấu, ví dụ 'thay dau'."""
    last = func.max(Occurrence.start_date)
    stmt = (
        select(Event)
        .outerjoin(Occurrence, Occurrence.event_id == Event.id)
        .where(Event.user_id == user.id)
        .group_by(Event.id)
        .order_by(last.desc().nulls_last(), Event.title)
        .limit(limit)
    )
    if q.strip():
        stmt = stmt.where(Event.title_norm.contains(normalize_title(q), autoescape=True))
    if not include_archived:
        stmt = stmt.where(Event.archived_at.is_(None))
    return [_event_out(session, e) for e in session.scalars(stmt)]


@router.post("/events", status_code=201)
def create_event(body: EventCreate, user: UserDep, session: SessionDep, response: Response) -> CreateResult:
    title = clean_title(body.title)
    norm = normalize_title(title)
    if not norm:
        raise HTTPException(status_code=422, detail="Tên sự kiện trống")

    existing = session.scalar(select(Event).where(Event.user_id == user.id, Event.title_norm == norm))
    if existing is not None:
        if existing.kind == "occasional" and body.kind == "occasional":
            # Gõ lại đúng tên đã có -> thêm lần mới cho sự kiện đó thay vì tạo trùng.
            occ = _add_occurrence(session, existing, body.start_date, body.end_date, body.occurrence_note)
            session.commit()
            response.status_code = 200
            return CreateResult(event=_event_out(session, existing), occurrence=_occ_out(occ), reused=True)
        raise HTTPException(
            status_code=409, detail={"message": f"Đã có sự kiện “{existing.title}”", "event_id": existing.id}
        )

    event = Event(
        user_id=user.id,
        title=title,
        title_norm=norm,
        kind=body.kind,
        category=body.category or None,
        note=body.note or None,
    )
    occ: Occurrence | None = None
    if body.kind == "annual":
        event.calendar, event.rule_month, event.rule_day, event.rule_leap, event.rule_year = _resolve_rule(body)
        session.add(event)
        session.flush()
    else:
        session.add(event)
        session.flush()
        occ = _add_occurrence(session, event, body.start_date, body.end_date, body.occurrence_note)
    session.commit()
    return CreateResult(event=_event_out(session, event), occurrence=_occ_out(occ) if occ else None)


@router.get("/events/{event_id}")
def get_event(event_id: int, user: UserDep, session: SessionDep) -> EventOut:
    return _event_out(session, _get_event(session, user, event_id))


@router.patch("/events/{event_id}")
def update_event(event_id: int, body: EventUpdate, user: UserDep, session: SessionDep) -> EventOut:
    event = _get_event(session, user, event_id)
    fields = body.model_fields_set
    if "title" in fields and body.title is not None:
        title = clean_title(body.title)
        norm = normalize_title(title)
        if not norm:
            raise HTTPException(status_code=422, detail="Tên sự kiện trống")
        _check_title_free(session, user, norm, exclude_id=event.id)
        event.title, event.title_norm = title, norm
    if "category" in fields:
        event.category = body.category or None
    if "note" in fields:
        event.note = body.note or None
    if "archived" in fields and body.archived is not None:
        event.archived_at = datetime.now() if body.archived else None

    rule_fields = {"calendar", "rule_month", "rule_day", "rule_leap", "rule_year"}
    if fields & rule_fields:
        if event.kind != "annual":
            raise HTTPException(status_code=422, detail="Chỉ sự kiện thường niên có quy tắc lặp")
        event.calendar, event.rule_month, event.rule_day, event.rule_leap, event.rule_year = _resolve_rule(body)
    session.commit()
    return _event_out(session, event)


@router.delete("/events/{event_id}", status_code=204)
def delete_event(event_id: int, user: UserDep, session: SessionDep) -> None:
    session.delete(_get_event(session, user, event_id))
    session.commit()


# ---------- lần xảy ra ----------


@router.get("/occurrences")
def list_occurrences(
    user: UserDep,
    session: SessionDep,
    start: date,
    end: date,
    q: str = "",
    event_id: int | None = None,
) -> list[OccurrenceOut]:
    """Các lần xảy ra giao với khoảng [start, end]. Dùng cho calendar và bộ lọc.

    Sự kiện không thường xuyên lấy từ DB; sự kiện thường niên tính ngày từ quy tắc."""
    filters = [Event.user_id == user.id, Event.archived_at.is_(None)]
    if q.strip():
        filters.append(Event.title_norm.contains(normalize_title(q), autoescape=True))
    if event_id is not None:
        filters.append(Event.id == event_id)

    stmt = select(Occurrence).join(Event).where(*filters, Occurrence.start_date <= end, Occurrence.end_date >= start)
    result = [_occ_out(o) for o in session.scalars(stmt)]

    annual = session.scalars(select(Event).where(*filters, Event.kind == "annual"))
    years = range(max(start.year, 1800), min(end.year, 2199) + 1)  # giới hạn của thuật toán âm lịch
    for event in annual:
        for year in years:
            result += [_annual_out(event, d) for _, d in generator.annual_dates(event, year) if start <= d <= end]
    result.sort(key=lambda o: (o.start_date, o.id is not None, o.id or 0))
    return result


@router.post("/events/{event_id}/occurrences", status_code=201)
def add_occurrence(event_id: int, body: OccurrenceCreate, user: UserDep, session: SessionDep) -> OccurrenceOut:
    event = _get_event(session, user, event_id)
    occ = _add_occurrence(session, event, body.start_date, body.end_date, body.note)
    session.commit()
    return _occ_out(occ)


@router.patch("/occurrences/{occ_id}")
def update_occurrence(occ_id: int, body: OccurrenceUpdate, user: UserDep, session: SessionDep) -> OccurrenceOut:
    occ = _get_occurrence(session, user, occ_id)
    fields = body.model_fields_set
    start = body.start_date if "start_date" in fields and body.start_date else occ.start_date
    end = body.end_date if "end_date" in fields and body.end_date else occ.end_date
    if "start_date" in fields and "end_date" not in fields and occ.start_date == occ.end_date:
        end = start  # sự kiện một ngày: dời ngày thì dời cả hai đầu
    if end < start:
        raise HTTPException(status_code=422, detail="Ngày kết thúc phải sau ngày bắt đầu")
    occ.start_date, occ.end_date = start, end
    if "note" in fields:
        occ.note = body.note or None
    session.commit()
    return _occ_out(occ)


@router.delete("/occurrences/{occ_id}", status_code=204)
def delete_occurrence(occ_id: int, user: UserDep, session: SessionDep) -> None:
    occ = _get_occurrence(session, user, occ_id)
    session.delete(occ)
    session.commit()


# ---------- âm lịch ----------


@router.get("/lunar/range")
def to_lunar_range(start: date, end: date, _user: UserDep) -> list[LunarDayOut]:
    """Ngày âm, rằm và ngày lễ cho từng ngày trong [start, end] (tối đa 62 ngày), để hiện trên lưới calendar."""
    if end < start or (end - start).days > 62:
        raise HTTPException(status_code=422, detail="Khoảng ngày không hợp lệ (tối đa 62 ngày)")
    result = []
    d = start
    while d <= end:
        ld = solar_to_lunar(d)
        result.append(
            LunarDayOut(
                date=d,
                day=ld.day,
                month=ld.month,
                year=ld.year,
                leap=ld.leap,
                full_moon=ld.day == 15,
                holidays=[HolidayOut(name=x.name, calendar=x.calendar, off=x.off) for x in holidays_on(d, ld)],
            )
        )
        d += timedelta(days=1)
    return result
