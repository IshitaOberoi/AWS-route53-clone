"""Shared fixtures: every test gets a fresh, fully migrated temporary SQLite database."""

from collections.abc import Iterator
from pathlib import Path
from typing import Any

import pytest
from alembic import command
from alembic.config import Config
from fastapi.testclient import TestClient
from sqlalchemy import Engine
from sqlalchemy.orm import Session, sessionmaker

from app.db import create_db_engine, create_session_factory
from app.deps import get_db
from app.main import create_app
from app.models import User
from app.services.auth_service import hash_password

BACKEND_DIR = Path(__file__).resolve().parent.parent


def alembic_config(url: str) -> Config:
    cfg = Config(str(BACKEND_DIR / "alembic.ini"))
    cfg.set_main_option("script_location", str(BACKEND_DIR / "alembic"))
    cfg.set_main_option("sqlalchemy.url", url)
    cfg.attributes["configure_logger"] = False
    return cfg


@pytest.fixture
def db_url(tmp_path: Path) -> str:
    return f"sqlite:///{tmp_path / 'test.db'}"


@pytest.fixture
def engine(db_url: str) -> Iterator[Engine]:
    command.upgrade(alembic_config(db_url), "head")
    eng = create_db_engine(db_url)
    yield eng
    eng.dispose()


@pytest.fixture
def session_factory(engine: Engine) -> sessionmaker[Session]:
    return create_session_factory(engine)


@pytest.fixture
def db(session_factory: sessionmaker[Session]) -> Iterator[Session]:
    with session_factory() as session:
        yield session


@pytest.fixture
def client(session_factory: sessionmaker[Session]) -> Iterator[TestClient]:
    app = create_app()

    def _get_db() -> Iterator[Session]:
        with session_factory() as session:
            yield session

    app.dependency_overrides[get_db] = _get_db
    with TestClient(app) as test_client:
        yield test_client


# --- users & authenticated clients ------------------------------------------------------

DEMO_PASSWORD = "demo1234"


def make_user(db: Session, username: str, account_id: str = "123456789012") -> User:
    user = User(
        username=username,
        password_hash=hash_password(DEMO_PASSWORD),
        display_name=username.title(),
        account_id=account_id,
    )
    db.add(user)
    db.commit()
    return user


def login(client: TestClient, username: str = "demo", password: str = DEMO_PASSWORD) -> None:
    response = client.post("/api/auth/login", json={"username": username, "password": password})
    assert response.status_code == 200, response.text


@pytest.fixture
def demo_user(db: Session) -> User:
    return make_user(db, "demo")


@pytest.fixture
def auth_client(client: TestClient, demo_user: User) -> TestClient:
    login(client)
    return client


def create_zone(client: TestClient, name: str = "example.com", **extra: Any) -> dict[str, Any]:
    response = client.post("/api/hosted-zones", json={"name": name, **extra})
    assert response.status_code == 201, response.text
    body: dict[str, Any] = response.json()
    return body


@pytest.fixture
def zone(auth_client: TestClient) -> dict[str, Any]:
    return create_zone(auth_client, "example.com")
