"""API ghi chú. Mỗi người chỉ thấy và sửa ghi chú của mình."""

from datetime import date, datetime

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field, field_validator
from sqlalchemy import delete, select

from note.models import Note
from note.users import SessionDep, UserDep, now

router = APIRouter(prefix="/api/notes", tags=["note"])

MAX_LEN = 5000


def _clean_content(value: str | None) -> str | None:
    """Bỏ khoảng trắng thừa ở cuối mỗi dòng và dòng trống ở đầu/cuối, giữ xuống dòng."""
    if value is None:
        return None
    value = "\n".join(line.rstrip() for line in value.replace("\r\n", "\n").split("\n")).strip("\n")
    if not value.strip():
        raise ValueError("Ghi chú không được để trống")
    return value


class NoteIn(BaseModel):
    content: str = Field(max_length=MAX_LEN)
    due: date | None = None

    _content = field_validator("content")(_clean_content)


class NotePatch(BaseModel):
    """Chỉ đổi các trường được gửi lên; gửi `due: null` để bỏ hạn chót."""

    content: str | None = Field(default=None, max_length=MAX_LEN)
    due: date | None = None
    done: bool | None = None

    _content = field_validator("content")(_clean_content)


class NoteOut(BaseModel):
    id: int
    content: str
    due: date | None
    done: bool
    created_at: datetime
    done_at: datetime | None


def _order(notes: list[Note]) -> list[Note]:
    """Chưa xong lên trước: có hạn xếp trên (hạn gần trước), không có hạn xếp dưới (mới ghi trước);
    đã xong xếp sau (xong gần đây trước)."""
    open_ = [n for n in notes if not n.done]
    with_due = sorted((n for n in open_ if n.due), key=lambda n: (n.due, n.id))
    no_due = sorted((n for n in open_ if not n.due), key=lambda n: n.id, reverse=True)
    done = sorted((n for n in notes if n.done), key=lambda n: n.done_at or datetime.min, reverse=True)
    return with_due + no_due + done


def _get(session: SessionDep, user: UserDep, note_id: int) -> Note:
    note = session.get(Note, note_id)
    if note is None or note.user_id != user.id:
        raise HTTPException(404, "Không tìm thấy ghi chú này")
    return note


@router.get("", response_model=list[NoteOut])
def list_notes(session: SessionDep, user: UserDep) -> list[Note]:
    return _order(list(session.scalars(select(Note).where(Note.user_id == user.id))))


@router.post("", response_model=NoteOut, status_code=201)
def create_note(body: NoteIn, session: SessionDep, user: UserDep) -> Note:
    note = Note(user_id=user.id, content=body.content, due=body.due, created_at=now())
    session.add(note)
    session.commit()
    return note


@router.patch("/{note_id}", response_model=NoteOut)
def update_note(note_id: int, body: NotePatch, session: SessionDep, user: UserDep) -> Note:
    note = _get(session, user, note_id)
    sent = body.model_fields_set
    if "content" in sent:
        if body.content is None:
            raise HTTPException(422, "Ghi chú không được để trống")
        note.content = body.content
    if "due" in sent:
        note.due = body.due
    if "done" in sent and body.done is not None and body.done != note.done:
        note.done = body.done
        note.done_at = now() if body.done else None
    session.commit()
    return note


@router.delete("/done", status_code=204)
def clear_done(session: SessionDep, user: UserDep) -> None:
    """Xoá mọi ghi chú đã xong."""
    session.execute(delete(Note).where(Note.user_id == user.id, Note.done.is_(True)))
    session.commit()


@router.delete("/{note_id}", status_code=204)
def delete_note(note_id: int, session: SessionDep, user: UserDep) -> None:
    session.delete(_get(session, user, note_id))
    session.commit()
