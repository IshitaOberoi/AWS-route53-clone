"""Mocked authentication: password hashing and cookie sessions.

Passwords use PBKDF2-HMAC-SHA256 from the standard library with a per-user random salt.
Session tokens are random; only their SHA-256 digest is stored, so a leaked database
cannot be replayed as a cookie. Sessions slide: every authenticated request pushes
``expires_at`` forward to ``now + SESSION_TTL_DAYS``.
"""

import hashlib
import hmac
import secrets
from datetime import UTC, datetime, timedelta

from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from app.config import get_settings
from app.errors import AppError, Unauthorized
from app.ids import hash_token, new_session_token
from app.models import User, UserSession, utcnow

_PBKDF2_ITERATIONS = 240_000
_HASH_SCHEME = "pbkdf2_sha256"
# Only write last_seen/expires_at when it actually moves, to avoid a write on every request.
_TOUCH_INTERVAL = timedelta(minutes=1)


def hash_password(password: str, *, salt: str | None = None) -> str:
    salt = salt or secrets.token_hex(16)
    digest = hashlib.pbkdf2_hmac(
        "sha256", password.encode("utf-8"), salt.encode("ascii"), _PBKDF2_ITERATIONS
    )
    return f"{_HASH_SCHEME}${_PBKDF2_ITERATIONS}${salt}${digest.hex()}"


def verify_password(password: str, stored: str) -> bool:
    try:
        scheme, iterations, salt, expected = stored.split("$")
    except ValueError:
        return False
    if scheme != _HASH_SCHEME:
        return False
    digest = hashlib.pbkdf2_hmac(
        "sha256", password.encode("utf-8"), salt.encode("ascii"), int(iterations)
    )
    return hmac.compare_digest(digest.hex(), expected)


def session_ttl() -> timedelta:
    return timedelta(days=get_settings().session_ttl_days)


def authenticate(db: Session, username: str, password: str) -> User:
    user = db.scalar(select(User).where(User.username == username.strip()))
    if user is None or not verify_password(password, user.password_hash):
        raise AppError(401, "InvalidCredentials", "Invalid username or password.")
    return user


def create_session(db: Session, user: User) -> str:
    """Create a session row and return the raw token to place in the cookie."""
    token = new_session_token()
    now = utcnow()
    db.add(
        UserSession(
            id=hash_token(token),
            user_id=user.id,
            created_at=now,
            last_seen_at=now,
            expires_at=now + session_ttl(),
        )
    )
    # Opportunistic cleanup of this user's expired sessions.
    db.execute(
        delete(UserSession).where(UserSession.user_id == user.id, UserSession.expires_at < now)
    )
    db.commit()
    return token


def resolve_session(db: Session, token: str | None) -> tuple[User, bool]:
    """Return ``(user, refreshed)`` for a cookie token, sliding the expiry.

    ``refreshed`` is true when the expiry moved, so the caller can re-issue the cookie with a
    fresh ``Max-Age``. Raises 401 if the token is missing, unknown or expired.
    """
    if not token:
        raise Unauthorized()
    session = db.get(UserSession, hash_token(token))
    now = datetime.now(UTC)
    if session is None:
        raise Unauthorized("Your session is invalid. Please sign in again.")
    if session.expires_at <= now:
        db.delete(session)
        db.commit()
        raise Unauthorized("Your session has expired. Please sign in again.")
    refreshed = False
    if now - session.last_seen_at >= _TOUCH_INTERVAL:
        session.last_seen_at = now
        session.expires_at = now + session_ttl()
        db.commit()
        refreshed = True
    return session.user, refreshed


def delete_session(db: Session, token: str | None) -> None:
    if not token:
        return
    db.execute(delete(UserSession).where(UserSession.id == hash_token(token)))
    db.commit()
