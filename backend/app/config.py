"""Application settings, loaded from environment variables (and an optional .env file)."""

import json
from functools import lru_cache
from typing import Annotated

from pydantic import field_validator
from pydantic_settings import BaseSettings, NoDecode, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    database_url: str = "sqlite:///./route53.db"
    cors_origins: Annotated[list[str], NoDecode] = ["http://localhost:3000"]
    cookie_secure: bool = False
    session_ttl_days: int = 7
    seed_demo_data: bool = True

    @field_validator("cors_origins", mode="before")
    @classmethod
    def _parse_origins(cls, value: object) -> object:
        """Accept a JSON list or a comma-separated string (``https://a,https://b``)."""
        if isinstance(value, str):
            text = value.strip()
            if text.startswith("["):
                return json.loads(text)
            return [origin.strip() for origin in text.split(",") if origin.strip()]
        return value


@lru_cache
def get_settings() -> Settings:
    return Settings()
