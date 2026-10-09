"""Auth request/response schemas."""

from pydantic import BaseModel, Field

from app.schemas.common import OrmModel


class LoginIn(BaseModel):
    username: str = Field(min_length=1, max_length=64, examples=["demo"])
    password: str = Field(min_length=1, max_length=256, examples=["demo1234"])


class UserOut(OrmModel):
    id: int
    username: str
    display_name: str
    account_id: str
