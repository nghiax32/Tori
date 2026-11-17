"""Người học, nhận diện theo email đăng nhập."""

from datetime import UTC, datetime
from typing import Annotated

from fastapi import Depends, Request
from sqlalchemy import select
from sqlalchemy.orm import Session
from tori_core import Identity, get_identity

from learningenglish.db import SessionLocal, get_session
from learningenglish.models import User

SessionDep = Annotated[Session, Depends(get_session)]


def now() -> datetime:
    return datetime.now(UTC).replace(tzinfo=None)


def _upsert_user(session: Session, identity: Identity, *, login: bool) -> User:
    email = identity.email.strip().lower()
    user = session.scalar(select(User).where(User.email == email))
    if user is None:
        user = User(email=email)
        session.add(user)
    user.name = identity.name
    if login:
        user.last_login_at = now()
    session.flush()
    return user


def record_login(identity: Identity) -> None:
    """Callback cho tori_core.build_auth_router: lưu người học khi đăng nhập."""
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


def display_name(user: User) -> str:
    """Tên trên bảng xếp hạng: tên Google, không có thì phần trước @ của email (không lộ email đầy đủ)."""
    return user.name or user.email.split("@")[0]
