"""Auth: login, logout, /me, session expiry and cookie attributes."""

from datetime import UTC, datetime, timedelta

from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.ids import hash_token
from app.models import User, UserSession

from .conftest import DEMO_PASSWORD, login


def test_login_ok_sets_http_only_cookie(client: TestClient, demo_user: User) -> None:
    response = client.post("/api/auth/login", json={"username": "demo", "password": DEMO_PASSWORD})
    assert response.status_code == 200
    assert response.json() == {
        "id": demo_user.id,
        "username": "demo",
        "display_name": "Demo",
        "account_id": "123456789012",
    }
    cookie = response.headers["set-cookie"]
    assert cookie.startswith("r53_session=")
    assert "HttpOnly" in cookie
    assert "SameSite=lax" in cookie
    assert "Path=/" in cookie
    assert "Max-Age=604800" in cookie


def test_session_token_is_stored_hashed(client: TestClient, demo_user: User, db: Session) -> None:
    login(client)
    token = client.cookies["r53_session"]
    session = db.scalar(select(UserSession).where(UserSession.user_id == demo_user.id))
    assert session is not None
    assert session.id == hash_token(token)
    assert session.id != token


def test_login_bad_password_401(client: TestClient, demo_user: User) -> None:
    response = client.post("/api/auth/login", json={"username": "demo", "password": "wrong"})
    assert response.status_code == 401
    assert response.json()["error"] == {
        "code": "InvalidCredentials",
        "message": "Invalid username or password.",
        "field_errors": {},
    }
    assert "set-cookie" not in response.headers


def test_login_unknown_user_401(client: TestClient, demo_user: User) -> None:
    response = client.post("/api/auth/login", json={"username": "nobody", "password": "x"})
    assert response.status_code == 401
    assert response.json()["error"]["code"] == "InvalidCredentials"


def test_login_missing_fields_422(client: TestClient) -> None:
    response = client.post("/api/auth/login", json={"username": ""})
    assert response.status_code == 422
    error = response.json()["error"]
    assert error["code"] == "ValidationError"
    assert {"username", "password"} <= error["field_errors"].keys()


def test_me_without_cookie_401(client: TestClient) -> None:
    response = client.get("/api/auth/me")
    assert response.status_code == 401
    assert response.json()["error"]["code"] == "Unauthorized"


def test_me_with_cookie(auth_client: TestClient) -> None:
    response = auth_client.get("/api/auth/me")
    assert response.status_code == 200
    assert response.json()["username"] == "demo"


def test_logout_invalidates_session(auth_client: TestClient, db: Session) -> None:
    token = auth_client.cookies["r53_session"]
    response = auth_client.post("/api/auth/logout")
    assert response.status_code == 204
    assert (
        'r53_session=""' in response.headers["set-cookie"]
        or "Max-Age=0" in response.headers["set-cookie"]
    )
    assert db.get(UserSession, hash_token(token)) is None
    # Replaying the old cookie no longer works.
    auth_client.cookies.set("r53_session", token)
    assert auth_client.get("/api/auth/me").status_code == 401


def test_expired_session_401_and_cookie_cleared(auth_client: TestClient, db: Session) -> None:
    token = auth_client.cookies["r53_session"]
    session = db.get(UserSession, hash_token(token))
    assert session is not None
    session.expires_at = datetime.now(UTC) - timedelta(seconds=1)
    db.commit()
    response = auth_client.get("/api/auth/me")
    assert response.status_code == 401
    assert "expired" in response.json()["error"]["message"]
    assert "r53_session=" in response.headers["set-cookie"]
    db.expire_all()
    assert db.get(UserSession, hash_token(token)) is None


def test_invalid_cookie_401(client: TestClient) -> None:
    client.cookies.set("r53_session", "not-a-real-token")
    response = client.get("/api/auth/me")
    assert response.status_code == 401


def test_session_slides_forward(auth_client: TestClient, db: Session) -> None:
    token = auth_client.cookies["r53_session"]
    session = db.get(UserSession, hash_token(token))
    assert session is not None
    stale = datetime.now(UTC) - timedelta(days=3)
    session.last_seen_at = stale
    session.expires_at = stale + timedelta(days=7)
    db.commit()
    response = auth_client.get("/api/auth/me")
    assert response.status_code == 200
    assert "Max-Age=604800" in response.headers["set-cookie"]
    db.expire_all()
    refreshed = db.get(UserSession, hash_token(token))
    assert refreshed is not None
    assert refreshed.expires_at > datetime.now(UTC) + timedelta(days=6)


def test_protected_routes_require_session(client: TestClient) -> None:
    for method, path in [
        ("get", "/api/hosted-zones"),
        ("post", "/api/hosted-zones"),
        ("get", "/api/hosted-zones/Z123/records"),
        ("get", "/api/meta/vpcs"),
        ("post", "/api/auth/logout"),
    ]:
        response = getattr(client, method)(path)
        assert response.status_code == 401, path
