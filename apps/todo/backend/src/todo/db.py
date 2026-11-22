from collections.abc import Iterator

from sqlalchemy.orm import Session, sessionmaker
from tori_core import make_engine

from todo.models import Base

engine = make_engine("todo")
SessionLocal = sessionmaker(engine, expire_on_commit=False)


def init_db() -> None:
    Base.metadata.create_all(engine)


def get_session() -> Iterator[Session]:
    with SessionLocal() as session:
        yield session
