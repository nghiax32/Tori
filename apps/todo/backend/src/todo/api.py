"""API việc cần làm. Mỗi người chỉ thấy và sửa việc của mình."""

from datetime import date, datetime

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field, field_validator
from sqlalchemy import delete, select

from todo.models import Task
from todo.users import SessionDep, UserDep, now

router = APIRouter(prefix="/api/tasks", tags=["todo"])


def _clean_title(value: str | None) -> str | None:
    if value is None:
        return None
    value = " ".join(value.split())
    if not value:
        raise ValueError("Tên việc không được để trống")
    return value


class TaskIn(BaseModel):
    title: str = Field(max_length=200)
    due: date | None = None

    _title = field_validator("title")(_clean_title)


class TaskPatch(BaseModel):
    """Chỉ đổi các trường được gửi lên; gửi `due: null` để bỏ hạn chót."""

    title: str | None = Field(default=None, max_length=200)
    due: date | None = None
    done: bool | None = None

    _title = field_validator("title")(_clean_title)


class TaskOut(BaseModel):
    id: int
    title: str
    due: date | None
    done: bool
    created_at: datetime
    done_at: datetime | None


def _order(tasks: list[Task]) -> list[Task]:
    """Chưa xong lên trước (hạn gần trước, không có hạn xếp sau, rồi việc thêm trước), đã xong xếp
    sau (xong gần đây trước)."""
    open_ = sorted((t for t in tasks if not t.done), key=lambda t: (t.due is None, t.due or date.max, t.id))
    done = sorted((t for t in tasks if t.done), key=lambda t: t.done_at or datetime.min, reverse=True)
    return open_ + done


def _get(session: SessionDep, user: UserDep, task_id: int) -> Task:
    task = session.get(Task, task_id)
    if task is None or task.user_id != user.id:
        raise HTTPException(404, "Không tìm thấy việc này")
    return task


@router.get("", response_model=list[TaskOut])
def list_tasks(session: SessionDep, user: UserDep) -> list[Task]:
    return _order(list(session.scalars(select(Task).where(Task.user_id == user.id))))


@router.post("", response_model=TaskOut, status_code=201)
def create_task(body: TaskIn, session: SessionDep, user: UserDep) -> Task:
    task = Task(user_id=user.id, title=body.title, due=body.due, created_at=now())
    session.add(task)
    session.commit()
    return task


@router.patch("/{task_id}", response_model=TaskOut)
def update_task(task_id: int, body: TaskPatch, session: SessionDep, user: UserDep) -> Task:
    task = _get(session, user, task_id)
    sent = body.model_fields_set
    if "title" in sent:
        if body.title is None:
            raise HTTPException(422, "Tên việc không được để trống")
        task.title = body.title
    if "due" in sent:
        task.due = body.due
    if "done" in sent and body.done is not None and body.done != task.done:
        task.done = body.done
        task.done_at = now() if body.done else None
    session.commit()
    return task


@router.delete("/done", status_code=204)
def clear_done(session: SessionDep, user: UserDep) -> None:
    """Xoá mọi việc đã xong."""
    session.execute(delete(Task).where(Task.user_id == user.id, Task.done.is_(True)))
    session.commit()


@router.delete("/{task_id}", status_code=204)
def delete_task(task_id: int, session: SessionDep, user: UserDep) -> None:
    session.delete(_get(session, user, task_id))
    session.commit()
