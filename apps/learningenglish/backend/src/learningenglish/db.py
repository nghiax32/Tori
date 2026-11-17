from collections.abc import Iterator

from sqlalchemy import Connection, select
from sqlalchemy.orm import Session, sessionmaker
from tori_core import make_engine

from learningenglish.examples import EXAMPLES, TRANSLATIONS
from learningenglish.levels import level_of
from learningenglish.models import Base, EnglishWord
from learningenglish.topics import TOPIC_OF
from learningenglish.words import WORDS

engine = make_engine("learningenglish")
SessionLocal = sessionmaker(engine, expire_on_commit=False)


def init_db() -> None:
    with engine.begin() as conn:
        _add_column(conn, "english_words", "example_vi", "VARCHAR(250) NOT NULL DEFAULT ''")
        _add_column(conn, "english_words", "topic", "VARCHAR(20) NOT NULL DEFAULT ''")
        _add_column(conn, "english_words", "level", "VARCHAR(2) NOT NULL DEFAULT 'B1'")
    Base.metadata.create_all(engine)
    seed_words()


def _add_column(conn: Connection, table: str, column: str, ddl: str) -> None:
    """Thêm cột cho DB tạo trước khi có tính năng cần cột đó (bảng chưa có thì create_all sẽ tạo đủ)."""
    cols = {row[1] for row in conn.exec_driver_sql(f"PRAGMA table_info({table})")}
    if cols and column not in cols:
        conn.exec_driver_sql(f"ALTER TABLE {table} ADD COLUMN {column} {ddl}")


def seed_words() -> None:
    """Nạp kho từ: thêm từ mới, cập nhật phiên âm, nghĩa, câu ví dụ, bản dịch, chủ đề, trình độ đã sửa trong
    words.py / examples.py / topics.py / levels.py."""
    with SessionLocal() as session:
        have = {w.word: w for w in session.scalars(select(EnglishWord))}
        for word, ipa, meaning in WORDS:
            example, example_vi, topic = EXAMPLES.get(word, ""), TRANSLATIONS.get(word, ""), TOPIC_OF.get(word, "")
            level = level_of(word)
            if word not in have:
                session.add(
                    EnglishWord(
                        word=word,
                        ipa=ipa,
                        meaning=meaning,
                        example=example,
                        example_vi=example_vi,
                        topic=topic,
                        level=level,
                    )
                )
            else:
                have[word].ipa = ipa
                have[word].meaning = meaning
                have[word].example = example
                have[word].example_vi = example_vi
                have[word].topic = topic
                have[word].level = level
        session.commit()


def get_session() -> Iterator[Session]:
    with SessionLocal() as session:
        yield session
