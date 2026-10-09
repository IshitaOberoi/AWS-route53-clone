"""DNS record schemas."""

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field

from app.dns_validation import MAX_TTL
from app.schemas.common import OrmModel

RecordType = Literal["A", "AAAA", "CNAME", "TXT", "MX", "NS", "PTR", "SRV", "CAA", "SOA"]
RoutingPolicy = Literal["SIMPLE", "WEIGHTED", "LATENCY", "FAILOVER", "GEOLOCATION", "MULTIVALUE"]
FailoverType = Literal["PRIMARY", "SECONDARY"]
AliasTargetType = Literal["RECORD_IN_ZONE", "CLOUDFRONT", "S3_WEBSITE", "ELB", "API_GATEWAY"]
RecordSortField = Literal["name", "type", "ttl", "routing_policy"]

MAX_BATCH = 100


class RecordIn(BaseModel):
    """One resource record set as entered in the console's *Create record* form."""

    name: str = Field(
        default="",
        max_length=255,
        description="Relative to the hosted zone ('' = apex). A trailing dot means absolute.",
        examples=["www"],
    )
    type: RecordType = Field(examples=["A"])
    ttl: int | None = Field(default=300, ge=0, le=MAX_TTL, description="Ignored for alias records")
    values: list[str] = Field(
        default_factory=list,
        max_length=400,
        description="One value per line. Empty for alias records.",
        examples=[["192.0.2.235"]],
    )
    routing_policy: RoutingPolicy = "SIMPLE"
    set_identifier: str = Field(
        default="", max_length=128, description='"Record ID" in the console'
    )
    weight: int | None = Field(default=None, ge=0, le=255)
    region: str | None = Field(default=None, max_length=32)
    failover: FailoverType | None = None
    geo_location: str | None = Field(default=None, max_length=16)
    health_check_id: str | None = Field(default=None, max_length=64)
    is_alias: bool = False
    alias_target: str | None = Field(default=None, max_length=255)
    alias_target_type: AliasTargetType | None = None
    evaluate_target_health: bool = False


class RecordBatchCreate(BaseModel):
    records: list[RecordIn] = Field(min_length=1, max_length=MAX_BATCH)


class RecordOut(OrmModel):
    id: str
    zone_id: str
    name: str = Field(description="FQDN with trailing dot", examples=["www.example.com."])
    type: RecordType
    ttl: int | None
    values: list[str]
    routing_policy: RoutingPolicy
    set_identifier: str
    weight: int | None
    region: str | None
    failover: FailoverType | None
    geo_location: str | None
    health_check_id: str | None
    is_alias: bool
    alias_target: str | None
    alias_target_type: AliasTargetType | None
    evaluate_target_health: bool
    is_default: bool
    created_at: datetime
    updated_at: datetime


class RecordBatchOut(BaseModel):
    items: list[RecordOut]


class BulkDeleteIn(BaseModel):
    ids: list[str] = Field(min_length=1, max_length=1000)


class BulkDeleteOut(BaseModel):
    deleted: int


class ZoneFileImport(BaseModel):
    zone_file: str = Field(
        min_length=1,
        max_length=1_000_000,
        description="Contents of a BIND zone file.",
        examples=["$TTL 300\nwww IN A 192.0.2.1\n"],
    )


class LineIssueOut(BaseModel):
    line: int
    message: str


class ZoneFileImportOut(BaseModel):
    created: int
    skipped: list[LineIssueOut]
    errors: list[LineIssueOut] = Field(
        default_factory=list, description="Always empty on success; errors return HTTP 400."
    )
