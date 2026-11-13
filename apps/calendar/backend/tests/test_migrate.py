from sqlalchemy import create_engine, text

from calendar_app.db import _add_tracked, _migrate_annual_rows, _migrate_category
from calendar_app.models import Base

OLD_SCHEMA = [
    "CREATE TABLE users (id INTEGER PRIMARY KEY, google_sub VARCHAR UNIQUE, email VARCHAR, name VARCHAR,"
    " avatar_url VARCHAR, created_at DATETIME, last_login_at DATETIME)",
    "CREATE TABLE events (id INTEGER PRIMARY KEY, user_id INTEGER, title VARCHAR(200), title_norm VARCHAR(200),"
    " kind VARCHAR, category VARCHAR, note VARCHAR, calendar VARCHAR, rule_month INTEGER, rule_day INTEGER,"
    " rule_leap BOOLEAN, origin_date DATE, created_at DATETIME, updated_at DATETIME, archived_at DATETIME)",
    "CREATE TABLE occurrences (id INTEGER PRIMARY KEY, event_id INTEGER REFERENCES events(id), start_date DATE,"
    " end_date DATE, cycle_year INTEGER, note VARCHAR, is_customized BOOLEAN NOT NULL, created_by VARCHAR NOT NULL,"
    " created_at DATETIME DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME DEFAULT CURRENT_TIMESTAMP, UNIQUE (event_id, cycle_year))",
    "CREATE INDEX ix_occ_range ON occurrences (start_date, end_date)",
    "INSERT INTO events (id, user_id, title, title_norm, kind, calendar, rule_month, rule_day, rule_leap, origin_date)"
    " VALUES (1, 1, 'SN', 'sn', 'annual', 'solar', 3, 15, 0, '1965-03-15'),"
    " (2, 1, 'Giỗ', 'gio', 'annual', 'lunar', 12, 20, 0, '2026-02-07'),"
    " (3, 1, 'Đi chơi', 'di choi', 'occasional', NULL, NULL, NULL, 0, NULL)",
    "INSERT INTO occurrences (id, event_id, start_date, end_date, cycle_year, is_customized, created_by) VALUES"
    " (1, 1, '2026-03-15', '2026-03-15', 2026, 0, 'generator'),"
    " (2, 3, '2026-05-01', '2026-05-03', NULL, 0, 'user')",
]


def test_migrate_old_db(tmp_path):
    engine = create_engine(f"sqlite:///{tmp_path / 'old.db'}")
    with engine.begin() as conn:
        for sql in OLD_SCHEMA:
            conn.execute(text(sql))
        _migrate_annual_rows(conn)
        _migrate_annual_rows(conn)  # chạy lại không làm gì
    Base.metadata.create_all(engine)
    with engine.connect() as conn:
        # 07/02/2026 dương = 20/12 âm năm 2025
        assert conn.execute(text("SELECT id, rule_year FROM events ORDER BY id")).all() == [(1, 1965), (2, 2025), (3, None)]
        assert conn.execute(text("SELECT id, event_id, start_date FROM occurrences")).all() == [(2, 3, "2026-05-01")]
        cols = {r[1] for r in conn.execute(text("PRAGMA table_info(occurrences)"))}
        assert "cycle_year" not in cols


def test_add_tracked_column(tmp_path):
    engine = create_engine(f"sqlite:///{tmp_path / 'old.db'}")
    with engine.begin() as conn:
        for sql in OLD_SCHEMA:
            conn.execute(text(sql))
        _migrate_annual_rows(conn)
        _add_tracked(conn)
        _add_tracked(conn)  # chạy lại không làm gì
        assert conn.execute(text("SELECT id, tracked FROM events ORDER BY id")).all() == [(1, 0), (2, 0), (3, 0)]


def test_migrate_category_to_labels(tmp_path):
    engine = create_engine(f"sqlite:///{tmp_path / 'old.db'}")
    with engine.begin() as conn:
        for sql in OLD_SCHEMA:
            conn.execute(text(sql))
        conn.execute(text("UPDATE events SET category = 'Gia đình' WHERE id IN (1, 3)"))
        _migrate_annual_rows(conn)
        _add_tracked(conn)
    Base.metadata.create_all(engine)
    with engine.begin() as conn:
        _migrate_category(conn)
        _migrate_category(conn)  # chạy lại không làm gì
        assert conn.execute(text("SELECT id, name FROM labels")).all() == [(1, "Gia đình")]
        assert conn.execute(text("SELECT * FROM event_labels ORDER BY event_id")).all() == [(1, 1), (3, 1)]
        assert conn.execute(text("SELECT * FROM occurrence_labels")).all() == [(2, 1)]  # lần của sự kiện 3
        assert "category" not in {r[1] for r in conn.execute(text("PRAGMA table_info(events)"))}
