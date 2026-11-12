from sqlalchemy import Engine, create_engine, event

from tori_core.config import get_settings


def make_engine(name: str) -> Engine:
    """Engine SQLite tại DATA_DIR/<name>.db, bật foreign key và WAL."""
    data_dir = get_settings().data_dir
    data_dir.mkdir(parents=True, exist_ok=True)
    engine = create_engine(f"sqlite:///{data_dir / f'{name}.db'}", connect_args={"check_same_thread": False})

    @event.listens_for(engine, "connect")
    def _on_connect(dbapi_conn, _record):
        cur = dbapi_conn.cursor()
        cur.execute("PRAGMA foreign_keys=ON")
        cur.execute("PRAGMA journal_mode=WAL")
        cur.close()

    return engine
