"""Hosted zone schemas."""

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field

from app.schemas.common import OrmModel

ZoneType = Literal["PUBLIC", "PRIVATE"]
ZoneSortField = Literal["name", "type", "record_count", "description", "id", "created_at"]

MAX_TAGS = 50


class VpcIn(BaseModel):
    region: str = Field(min_length=1, max_length=32, examples=["us-east-1"])
    vpc_id: str = Field(min_length=1, max_length=32, examples=["vpc-0a1b2c3d4e5f60001"])


class VpcOut(OrmModel):
    region: str
    vpc_id: str


class Tag(BaseModel):
    key: str = Field(max_length=128, examples=["Environment"])
    value: str = Field(default="", max_length=256, examples=["production"])


class HostedZoneCreate(BaseModel):
    name: str = Field(min_length=1, max_length=255, examples=["example.com"])
    description: str = Field(default="", max_length=256)
    type: ZoneType = "PUBLIC"
    vpcs: list[VpcIn] = Field(default_factory=list)
    tags: list[Tag] = Field(default_factory=list, max_length=MAX_TAGS)


class HostedZoneUpdate(BaseModel):
    description: str | None = Field(default=None, max_length=256)
    vpcs: list[VpcIn] | None = None


class TagsReplace(BaseModel):
    tags: list[Tag] = Field(max_length=MAX_TAGS)


class HostedZoneSummary(BaseModel):
    """A row of the hosted zones table."""

    id: str = Field(examples=["Z04431362XG8IOPJVNR1Y"])
    name: str = Field(description="FQDN with trailing dot", examples=["example.com."])
    type: ZoneType
    description: str
    caller_reference: str
    record_count: int
    created_at: datetime
    updated_at: datetime


class HostedZoneOut(HostedZoneSummary):
    """Hosted zone details, including delegation set, VPCs and tags."""

    name_servers: list[str]
    vpcs: list[VpcOut]
    tags: list[Tag]
