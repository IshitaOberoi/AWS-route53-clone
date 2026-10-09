"""FastAPI application factory."""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import get_settings
from app.errors import register_exception_handlers
from app.routers import auth, hosted_zones, meta, records

OPENAPI_TAGS = [
    {"name": "auth", "description": "Mocked login / logout with cookie sessions."},
    {"name": "hosted-zones", "description": "Create, view, edit and delete hosted zones."},
    {"name": "records", "description": "Manage DNS resource record sets inside a hosted zone."},
    {"name": "meta", "description": "Health check and mocked AWS catalog data."},
]


def create_app() -> FastAPI:
    settings = get_settings()
    app = FastAPI(
        title="Route 53 Clone API",
        version="1.0.0",
        description=(
            "Backend for a functional clone of the AWS Route 53 console. "
            "Authenticate with `POST /api/auth/login`; the `r53_session` cookie is then sent "
            "automatically. Errors always use the shape "
            '`{"error": {"code", "message", "field_errors"}}`.'
        ),
        openapi_tags=OPENAPI_TAGS,
    )
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )
    register_exception_handlers(app)
    app.include_router(auth.router)
    app.include_router(hosted_zones.router)
    app.include_router(records.router)
    app.include_router(records.zone_files)
    app.include_router(meta.router)
    return app


app = create_app()
