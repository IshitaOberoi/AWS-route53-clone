"""Database engine and session factory.

Every new SQLite connection gets ``PRAGMA foreign_keys=ON`` (so ``ON DELETE CASCADE`` works)
and ``PRAGMA journal_mode=WAL`` (readers don't block the single writer).
"""

from typing import Any

from sqlalchemy import Engine, create_engine, event
from sqlalchemy.orm import Session, sessionmaker

from app.config import get_settings


def _is_memory_url(url: str) -> bool:
    return url in ("sqlite://", "sqlite:///:memory:") or "mode=memory" in url


def create_db_engine(url: str) -> Engine:
    connect_args: dict[str, Any] = {}
    if url.startswith("sqlite"):
        # FastAPI may use a connection from a different thread than the one that created it.
        connect_args["check_same_thread"] = False
    engine = create_engine(url, connect_args=connect_args)

    if url.startswith("sqlite"):
        use_wal = not _is_memory_url(url)

        @event.listens_for(engine, "connect")
        def _set_sqlite_pragmas(dbapi_connection: Any, _record: Any) -> None:
            cursor = dbapi_connection.cursor()
            cursor.execute("PRAGMA foreign_keys=ON")
            if use_wal:
                cursor.execute("PRAGMA journal_mode=WAL")
            cursor.execute("PRAGMA busy_timeout=5000")
            cursor.close()

    return engine


def create_session_factory(engine: Engine) -> sessionmaker[Session]:
    return sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)


engine = create_db_engine(get_settings().database_url)
SessionLocal = create_session_factory(engine)
