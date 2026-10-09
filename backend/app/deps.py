"""FastAPI dependencies and session-cookie helpers."""

from collections.abc import Iterator
from typing import Annotated

from fastapi import Cookie, Depends, Response
from sqlalchemy.orm import Session

from app.config import get_settings
from app.db import SessionLocal
from app.errors import Unauthorized
from app.models import User
from app.services import auth_service

SESSION_COOKIE_NAME = "r53_session"


def get_db() -> Iterator[Session]:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


DbSession = Annotated[Session, Depends(get_db)]
SessionCookie = Annotated[str | None, Cookie(alias=SESSION_COOKIE_NAME, include_in_schema=False)]


def set_session_cookie(response: Response, token: str) -> None:
    settings = get_settings()
    response.set_cookie(
        key=SESSION_COOKIE_NAME,
        value=token,
        max_age=settings.session_ttl_days * 24 * 60 * 60,
        path="/",
        httponly=True,
        secure=settings.cookie_secure,
        samesite="lax",
    )


def clear_session_cookie(response: Response) -> None:
    settings = get_settings()
    response.delete_cookie(
        key=SESSION_COOKIE_NAME,
        path="/",
        httponly=True,
        secure=settings.cookie_secure,
        samesite="lax",
    )


def _clear_cookie_header() -> str:
    scratch = Response()
    clear_session_cookie(scratch)
    return scratch.headers["set-cookie"]


def get_current_user(db: DbSession, response: Response, token: SessionCookie = None) -> User:
    try:
        user, refreshed = auth_service.resolve_session(db, token)
    except Unauthorized as exc:
        if token:
            # A stale cookie is useless; tell the browser to drop it.
            exc.headers = {"set-cookie": _clear_cookie_header()}
        raise
    if refreshed and token:
        set_session_cookie(response, token)
    return user


CurrentUser = Annotated[User, Depends(get_current_user)]
