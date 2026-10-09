"""Mocked authentication endpoints (cookie session)."""

from fastapi import APIRouter, Response, status

from app.deps import (
    CurrentUser,
    DbSession,
    SessionCookie,
    clear_session_cookie,
    set_session_cookie,
)
from app.errors import errors_doc
from app.schemas.auth import LoginIn, UserOut
from app.services import auth_service

router = APIRouter(prefix="/api/auth", tags=["auth"])


@router.post(
    "/login",
    response_model=UserOut,
    summary="Sign in",
    description="Validates the demo credentials and sets the `r53_session` HttpOnly cookie.",
    responses=errors_doc(401, 422),
)
def login(data: LoginIn, response: Response, db: DbSession) -> UserOut:
    user = auth_service.authenticate(db, data.username, data.password)
    token = auth_service.create_session(db, user)
    set_session_cookie(response, token)
    return UserOut.model_validate(user)


@router.post(
    "/logout",
    status_code=status.HTTP_204_NO_CONTENT,
    response_class=Response,
    summary="Sign out",
    description="Deletes the server-side session and clears the cookie.",
    responses=errors_doc(401),
)
def logout(_user: CurrentUser, db: DbSession, token: SessionCookie = None) -> Response:
    auth_service.delete_session(db, token)
    response = Response(status_code=status.HTTP_204_NO_CONTENT)
    clear_session_cookie(response)
    return response


@router.get(
    "/me",
    response_model=UserOut,
    summary="Current user",
    responses=errors_doc(401),
)
def me(user: CurrentUser) -> UserOut:
    return UserOut.model_validate(user)
