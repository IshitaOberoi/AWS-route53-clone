"""SQLAlchemy 2.x ORM models. See AGENTS.md §3 for the schema contract."""

from datetime import UTC, datetime
from typing import Any, ClassVar

from sqlalchemy import (
    JSON,
    Boolean,
    CheckConstraint,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    MetaData,
    String,
    Text,
    TypeDecorator,
    UniqueConstraint,
    false,
)
from sqlalchemy.engine import Dialect
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship

RECORD_TYPES: tuple[str, ...] = (
    "A",
    "AAAA",
    "CNAME",
    "TXT",
    "MX",
    "NS",
    "PTR",
    "SRV",
    "CAA",
    "SOA",
)
ZONE_TYPES: tuple[str, ...] = ("PUBLIC", "PRIVATE")
ROUTING_POLICIES: tuple[str, ...] = (
    "SIMPLE",
    "WEIGHTED",
    "LATENCY",
    "FAILOVER",
    "GEOLOCATION",
    "MULTIVALUE",
)
FAILOVER_TYPES: tuple[str, ...] = ("PRIMARY", "SECONDARY")


def utcnow() -> datetime:
    return datetime.now(UTC)


def _in_list(column: str, values: tuple[str, ...]) -> str:
    quoted = ", ".join(f"'{value}'" for value in values)
    return f"{column} IN ({quoted})"


class UTCDateTime(TypeDecorator[datetime]):
    """Stores datetimes as naive UTC (SQLite has no tz support) and returns aware UTC values."""

    impl = DateTime
    cache_ok = True

    def process_bind_param(self, value: datetime | None, dialect: Dialect) -> datetime | None:
        if value is None:
            return None
        if value.tzinfo is None:
            return value
        return value.astimezone(UTC).replace(tzinfo=None)

    def process_result_value(self, value: datetime | None, dialect: Dialect) -> datetime | None:
        if value is None:
            return None
        return value.replace(tzinfo=UTC)


NAMING_CONVENTION: dict[str, str] = {
    "ix": "ix_%(table_name)s_%(column_0_N_name)s",
    "uq": "uq_%(table_name)s_%(column_0_N_name)s",
    "ck": "ck_%(table_name)s_%(constraint_name)s",
    "fk": "fk_%(table_name)s_%(column_0_name)s_%(referred_table_name)s",
    "pk": "pk_%(table_name)s",
}


class Base(DeclarativeBase):
    metadata = MetaData(naming_convention=NAMING_CONVENTION)
    type_annotation_map: ClassVar[dict[Any, Any]] = {datetime: UTCDateTime()}


class TimestampMixin:
    created_at: Mapped[datetime] = mapped_column(default=utcnow, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(default=utcnow, onupdate=utcnow, nullable=False)


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    username: Mapped[str] = mapped_column(String(64), unique=True, nullable=False)
    password_hash: Mapped[str] = mapped_column(Text, nullable=False)
    display_name: Mapped[str] = mapped_column(String(128), nullable=False)
    account_id: Mapped[str] = mapped_column(String(12), nullable=False)
    created_at: Mapped[datetime] = mapped_column(default=utcnow, nullable=False)

    sessions: Mapped[list["UserSession"]] = relationship(
        back_populates="user", cascade="all, delete-orphan", passive_deletes=True
    )
    hosted_zones: Mapped[list["HostedZone"]] = relationship(
        back_populates="owner", cascade="all, delete-orphan", passive_deletes=True
    )


class UserSession(Base):
    """A login session. ``id`` is the SHA-256 hex digest of the cookie token."""

    __tablename__ = "sessions"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    created_at: Mapped[datetime] = mapped_column(default=utcnow, nullable=False)
    expires_at: Mapped[datetime] = mapped_column(nullable=False)
    last_seen_at: Mapped[datetime] = mapped_column(default=utcnow, nullable=False)

    user: Mapped[User] = relationship(back_populates="sessions")


class HostedZone(TimestampMixin, Base):
    __tablename__ = "hosted_zones"
    __table_args__ = (
        CheckConstraint(_in_list("type", ZONE_TYPES), name="type"),
        CheckConstraint("length(description) <= 256", name="description_length"),
        Index("ix_hosted_zones_owner_id_name", "owner_id", "name"),
    )

    id: Mapped[str] = mapped_column(String(32), primary_key=True)
    owner_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    name: Mapped[str] = mapped_column(String(254), nullable=False)
    type: Mapped[str] = mapped_column(String(16), nullable=False)
    description: Mapped[str] = mapped_column(
        String(256), nullable=False, default="", server_default=""
    )
    caller_reference: Mapped[str] = mapped_column(String(64), unique=True, nullable=False)

    owner: Mapped[User] = relationship(back_populates="hosted_zones")
    vpcs: Mapped[list["HostedZoneVpc"]] = relationship(
        back_populates="zone",
        cascade="all, delete-orphan",
        passive_deletes=True,
        order_by="HostedZoneVpc.id",
    )
    tags: Mapped[list["HostedZoneTag"]] = relationship(
        back_populates="zone",
        cascade="all, delete-orphan",
        passive_deletes=True,
        order_by="HostedZoneTag.id",
    )
    records: Mapped[list["Record"]] = relationship(
        back_populates="zone", cascade="all, delete-orphan", passive_deletes=True
    )


class HostedZoneVpc(Base):
    __tablename__ = "hosted_zone_vpcs"
    __table_args__ = (UniqueConstraint("zone_id", "vpc_region", "vpc_id"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    zone_id: Mapped[str] = mapped_column(
        ForeignKey("hosted_zones.id", ondelete="CASCADE"), nullable=False
    )
    vpc_region: Mapped[str] = mapped_column(String(32), nullable=False)
    vpc_id: Mapped[str] = mapped_column(String(32), nullable=False)

    zone: Mapped[HostedZone] = relationship(back_populates="vpcs")


class HostedZoneTag(Base):
    __tablename__ = "hosted_zone_tags"
    __table_args__ = (
        UniqueConstraint("zone_id", "key"),
        CheckConstraint("length(key) BETWEEN 1 AND 128", name="key_length"),
        CheckConstraint("length(value) <= 256", name="value_length"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    zone_id: Mapped[str] = mapped_column(
        ForeignKey("hosted_zones.id", ondelete="CASCADE"), nullable=False
    )
    key: Mapped[str] = mapped_column(String(128), nullable=False)
    value: Mapped[str] = mapped_column(String(256), nullable=False, default="", server_default="")

    zone: Mapped[HostedZone] = relationship(back_populates="tags")


class Record(TimestampMixin, Base):
    """A resource record set. ``values`` holds one string per line of the console textarea."""

    __tablename__ = "records"
    __table_args__ = (
        UniqueConstraint("zone_id", "name", "type", "set_identifier"),
        CheckConstraint(_in_list("type", RECORD_TYPES), name="type"),
        CheckConstraint(_in_list("routing_policy", ROUTING_POLICIES), name="routing_policy"),
        CheckConstraint("ttl IS NULL OR (ttl BETWEEN 0 AND 2147483647)", name="ttl_range"),
        CheckConstraint("weight IS NULL OR (weight BETWEEN 0 AND 255)", name="weight_range"),
        CheckConstraint(
            "failover IS NULL OR " + _in_list("failover", FAILOVER_TYPES), name="failover"
        ),
        CheckConstraint("is_alias = 1 OR ttl IS NOT NULL", name="ttl_required_unless_alias"),
        CheckConstraint("is_alias = 0 OR alias_target IS NOT NULL", name="alias_target_required"),
        Index("ix_records_zone_id_type", "zone_id", "type"),
        Index("ix_records_zone_id_name", "zone_id", "name"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    zone_id: Mapped[str] = mapped_column(
        ForeignKey("hosted_zones.id", ondelete="CASCADE"), nullable=False
    )
    name: Mapped[str] = mapped_column(String(254), nullable=False)
    type: Mapped[str] = mapped_column(String(8), nullable=False)
    ttl: Mapped[int | None] = mapped_column(Integer, nullable=True)
    values: Mapped[list[str]] = mapped_column(JSON, nullable=False, default=list)
    routing_policy: Mapped[str] = mapped_column(
        String(16), nullable=False, default="SIMPLE", server_default="SIMPLE"
    )
    set_identifier: Mapped[str] = mapped_column(
        String(128), nullable=False, default="", server_default=""
    )
    weight: Mapped[int | None] = mapped_column(Integer, nullable=True)
    region: Mapped[str | None] = mapped_column(String(32), nullable=True)
    failover: Mapped[str | None] = mapped_column(String(16), nullable=True)
    geo_location: Mapped[str | None] = mapped_column(String(16), nullable=True)
    health_check_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    is_alias: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False, server_default=false()
    )
    alias_target: Mapped[str | None] = mapped_column(String(254), nullable=True)
    alias_target_type: Mapped[str | None] = mapped_column(String(32), nullable=True)
    evaluate_target_health: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False, server_default=false()
    )
    is_default: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False, server_default=false()
    )

    zone: Mapped[HostedZone] = relationship(back_populates="records")


__all__ = [
    "FAILOVER_TYPES",
    "RECORD_TYPES",
    "ROUTING_POLICIES",
    "ZONE_TYPES",
    "Base",
    "HostedZone",
    "HostedZoneTag",
    "HostedZoneVpc",
    "Record",
    "User",
    "UserSession",
    "utcnow",
]
