"""Uniform error contract (AGENTS.md §4.3).

Every non-2xx response has the shape::

    {"error": {"code": "...", "message": "...", "field_errors": {"records[0].ttl": "..."}}}
"""

import logging
from collections.abc import Sequence
from typing import Any

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field
from starlette.exceptions import HTTPException as StarletteHTTPException

logger = logging.getLogger(__name__)


class ErrorBody(BaseModel):
    code: str = Field(examples=["InvalidChangeBatch"])
    message: str = Field(examples=["Human readable explanation"])
    field_errors: dict[str, str] = Field(
        default_factory=dict, examples=[{"records[0].values[1]": "Invalid IPv4 address"}]
    )


class ErrorResponse(BaseModel):
    error: ErrorBody


class AppError(Exception):
    """A domain error that maps directly onto the error contract."""

    def __init__(
        self,
        status_code: int,
        code: str,
        message: str,
        field_errors: dict[str, str] | None = None,
        headers: dict[str, str] | None = None,
    ) -> None:
        super().__init__(message)
        self.status_code = status_code
        self.code = code
        self.message = message
        self.field_errors = field_errors or {}
        self.headers = headers


class ValidationAppError(AppError):
    def __init__(self, message: str, field_errors: dict[str, str] | None = None) -> None:
        super().__init__(422, "ValidationError", message, field_errors)


class InvalidChangeBatch(AppError):
    def __init__(
        self, message: str, field_errors: dict[str, str] | None = None, status_code: int = 400
    ) -> None:
        super().__init__(status_code, "InvalidChangeBatch", message, field_errors)


class NoSuchHostedZone(AppError):
    def __init__(self, zone_id: str) -> None:
        super().__init__(404, "NoSuchHostedZone", f"No hosted zone found with ID: {zone_id}")


class NoSuchRecord(AppError):
    def __init__(self, record_id: str) -> None:
        super().__init__(404, "NoSuchRecord", f"No record found with ID: {record_id}")


class Unauthorized(AppError):
    def __init__(
        self, message: str = "Authentication required.", headers: dict[str, str] | None = None
    ) -> None:
        super().__init__(401, "Unauthorized", message, headers=headers)


HOSTED_ZONE_NOT_EMPTY_MESSAGE = (
    "The specified hosted zone contains non-required resource record sets and so cannot be deleted."
)


class HostedZoneNotEmpty(AppError):
    def __init__(self) -> None:
        super().__init__(400, "HostedZoneNotEmpty", HOSTED_ZONE_NOT_EMPTY_MESSAGE)


def error_payload(code: str, message: str, field_errors: dict[str, str] | None = None) -> Any:
    return {"error": {"code": code, "message": message, "field_errors": field_errors or {}}}


def loc_to_path(loc: Sequence[int | str]) -> str:
    """Convert a pydantic error location into ``records[0].values[1]`` notation."""
    parts = list(loc)
    if parts and parts[0] in ("body", "query", "path", "header", "cookie"):
        parts = parts[1:]
    path = ""
    for part in parts:
        if isinstance(part, int):
            path += f"[{part}]"
        else:
            path += f".{part}" if path else str(part)
    return path or "request"


def _clean_message(message: str) -> str:
    for prefix in ("Value error, ", "Assertion failed, "):
        if message.startswith(prefix):
            return message[len(prefix) :]
    return message


def errors_doc(*statuses: int) -> dict[int | str, dict[str, Any]]:
    """``responses=`` helper so every documented error uses the ErrorResponse schema."""
    descriptions = {
        400: "Invalid change batch / business-rule violation",
        401: "Not authenticated",
        404: "Resource not found",
        409: "Conflict (resource already exists)",
        422: "Request validation failed",
    }
    return {
        status: {"model": ErrorResponse, "description": descriptions.get(status, "Error")}
        for status in statuses
    }


_HTTP_STATUS_CODES = {
    401: "Unauthorized",
    403: "Forbidden",
    404: "NotFound",
    405: "MethodNotAllowed",
}


def register_exception_handlers(app: FastAPI) -> None:
    @app.exception_handler(AppError)
    async def _app_error(_request: Request, exc: AppError) -> JSONResponse:
        return JSONResponse(
            status_code=exc.status_code,
            content=error_payload(exc.code, exc.message, exc.field_errors),
            headers=exc.headers,
        )

    @app.exception_handler(RequestValidationError)
    async def _validation_error(_request: Request, exc: RequestValidationError) -> JSONResponse:
        field_errors: dict[str, str] = {}
        for err in exc.errors():
            path = loc_to_path(err.get("loc", ()))
            field_errors.setdefault(path, _clean_message(str(err.get("msg", "Invalid value"))))
        first = next(iter(field_errors.items()), ("request", "Invalid request"))
        message = first[1] if first[0] == "request" else f"{first[0]}: {first[1]}"
        return JSONResponse(
            status_code=422,
            content=error_payload("ValidationError", message, field_errors),
        )

    @app.exception_handler(StarletteHTTPException)
    async def _http_error(_request: Request, exc: StarletteHTTPException) -> JSONResponse:
        code = _HTTP_STATUS_CODES.get(exc.status_code, "HttpError")
        return JSONResponse(
            status_code=exc.status_code,
            content=error_payload(code, str(exc.detail)),
            headers=getattr(exc, "headers", None),
        )

    @app.exception_handler(Exception)
    async def _unhandled(_request: Request, exc: Exception) -> JSONResponse:
        logger.exception("Unhandled error", exc_info=exc)
        return JSONResponse(
            status_code=500,
            content=error_payload("InternalError", "An internal error occurred."),
        )
