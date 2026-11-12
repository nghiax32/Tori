from collections.abc import Iterator

from datetime import date

from sqlalchemy import Connection
from sqlalchemy.orm import Session, sessionmaker
from tori_core import make_engine

from calendar_app.lunar import solar_to_lunar
from calendar_app.models import Base

engine = make_engine("calendar")
SessionLocal = sessionmaker(engine, expire_on_commit=False)


def _columns(conn: Connection, table: str) -> set[str]:
    return {row[1] for row in conn.exec_driver_sql(f"PRAGMA table_info({table})")}


def _migrate_annual_rows(conn: Connection) -> None:
    """Chuyển DB kiểu cũ (mỗi năm sinh sẵn một dòng cho sự kiện thường niên) sang kiểu mới.
    Chạy trước create_all; DB mới hoặc đã chuyển thì không làm gì. Xoá được khi mọi DB đã chuyển."""
    events = _columns(conn, "events")
    if "origin_date" in events:
        conn.exec_driver_sql("ALTER TABLE events ADD COLUMN rule_year INTEGER")
        rows = conn.exec_driver_sql("SELECT id, calendar, origin_date FROM events WHERE origin_date IS NOT NULL")
        for event_id, calendar, origin in list(rows):
            d = date.fromisoformat(origin)
            year = solar_to_lunar(d).year if calendar == "lunar" else d.year
            conn.exec_driver_sql("UPDATE events SET rule_year = ? WHERE id = ?", (year, event_id))
        conn.exec_driver_sql("ALTER TABLE events DROP COLUMN origin_date")
    if "cycle_year" in _columns(conn, "occurrences"):
        conn.exec_driver_sql("ALTER TABLE occurrences RENAME TO occurrences_old")
        conn.exec_driver_sql("DROP INDEX IF EXISTS ix_occ_range")
        Base.metadata.tables["occurrences"].create(conn)
        conn.exec_driver_sql(
            "INSERT INTO occurrences (id, event_id, start_date, end_date, note, created_at, updated_at)"
            " SELECT o.id, o.event_id, o.start_date, o.end_date, o.note, o.created_at, o.updated_at"
            " FROM occurrences_old o JOIN events e ON e.id = o.event_id WHERE e.kind = 'occasional'"
        )
        conn.exec_driver_sql("DROP TABLE occurrences_old")


def init_db() -> None:
    with engine.begin() as conn:
        if "events" in {row[0] for row in conn.exec_driver_sql("SELECT name FROM sqlite_master WHERE type='table'")}:
            _migrate_annual_rows(conn)
    Base.metadata.create_all(engine)


def get_session() -> Iterator[Session]:
    with SessionLocal() as session:
        yield session
