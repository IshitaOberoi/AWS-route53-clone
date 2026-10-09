"""Hosted zone business logic (AGENTS.md §4.1)."""

from dataclasses import dataclass
from typing import cast

from sqlalchemy import ColumnElement, func, or_, select
from sqlalchemy.orm import QueryableAttribute, Session, selectinload

from app.catalog import VPC_KEYS
from app.dns_validation import DnsValueError, normalize_domain_name
from app.errors import HostedZoneNotEmpty, InvalidChangeBatch, NoSuchHostedZone
from app.ids import (
    name_servers_for_zone,
    new_caller_reference,
    new_record_id,
    new_zone_id,
    soa_value_for_zone,
)
from app.models import HostedZone, HostedZoneTag, HostedZoneVpc, Record, User, utcnow
from app.schemas.common import Page
from app.schemas.hosted_zone import (
    HostedZoneCreate,
    HostedZoneOut,
    HostedZoneSummary,
    HostedZoneUpdate,
    Tag,
    VpcIn,
    VpcOut,
    ZoneSortField,
    ZoneType,
)

DEFAULT_NS_TTL = 172800
DEFAULT_SOA_TTL = 900


def build_default_records(zone_id: str, zone_name: str) -> list[Record]:
    """The apex NS and SOA records Route 53 creates with every hosted zone."""
    return [
        Record(
            id=new_record_id(),
            zone_id=zone_id,
            name=zone_name,
            type="NS",
            ttl=DEFAULT_NS_TTL,
            values=name_servers_for_zone(zone_id),
            is_default=True,
        ),
        Record(
            id=new_record_id(),
            zone_id=zone_id,
            name=zone_name,
            type="SOA",
            ttl=DEFAULT_SOA_TTL,
            values=[soa_value_for_zone(zone_id)],
            is_default=True,
        ),
    ]


# --- helpers ----------------------------------------------------------------------------


def get_owned_zone(db: Session, owner: User, zone_id: str) -> HostedZone:
    """Load a zone that belongs to ``owner`` or raise 404 (other users' zones are invisible)."""
    zone = db.scalar(
        select(HostedZone)
        .where(HostedZone.id == zone_id, HostedZone.owner_id == owner.id)
        .options(selectinload(HostedZone.vpcs), selectinload(HostedZone.tags))
    )
    if zone is None:
        raise NoSuchHostedZone(zone_id)
    return zone


def record_count(db: Session, zone_id: str) -> int:
    return db.scalar(select(func.count(Record.id)).where(Record.zone_id == zone_id)) or 0


def _name_servers(db: Session, zone: HostedZone) -> list[str]:
    ns = db.scalar(
        select(Record).where(
            Record.zone_id == zone.id,
            Record.type == "NS",
            Record.name == zone.name,
            Record.is_default.is_(True),
        )
    )
    return list(ns.values) if ns else name_servers_for_zone(zone.id)


def _summary(zone: HostedZone, count: int) -> HostedZoneSummary:
    return HostedZoneSummary(
        id=zone.id,
        name=zone.name,
        type=cast(ZoneType, zone.type),
        description=zone.description,
        caller_reference=zone.caller_reference,
        record_count=count,
        created_at=zone.created_at,
        updated_at=zone.updated_at,
    )


def to_out(db: Session, zone: HostedZone) -> HostedZoneOut:
    summary = _summary(zone, record_count(db, zone.id))
    return HostedZoneOut(
        **summary.model_dump(),
        name_servers=_name_servers(db, zone),
        vpcs=[VpcOut(region=v.vpc_region, vpc_id=v.vpc_id) for v in zone.vpcs],
        tags=[Tag(key=t.key, value=t.value) for t in zone.tags],
    )


def _validate_vpcs(vpcs: list[VpcIn], field: str = "vpcs") -> dict[str, str]:
    errors: dict[str, str] = {}
    seen: set[tuple[str, str]] = set()
    for index, vpc in enumerate(vpcs):
        key = (vpc.region.strip(), vpc.vpc_id.strip())
        if key not in VPC_KEYS:
            errors[f"{field}[{index}].vpc_id"] = f"VPC {key[1]} was not found in region {key[0]}."
        elif key in seen:
            errors[f"{field}[{index}].vpc_id"] = "This VPC is already associated."
        seen.add(key)
    return errors


def _validate_tags(tags: list[Tag], field: str = "tags") -> dict[str, str]:
    errors: dict[str, str] = {}
    seen: set[str] = set()
    for index, tag in enumerate(tags):
        key = tag.key.strip()
        if not key:
            errors[f"{field}[{index}].key"] = "Tag key is required."
        elif key.lower().startswith("aws:"):
            errors[f"{field}[{index}].key"] = 'Tag keys cannot start with "aws:".'
        elif key in seen:
            errors[f"{field}[{index}].key"] = "Tag keys must be unique."
        seen.add(key)
    return errors


def _first_message(errors: dict[str, str]) -> str:
    message = next(iter(errors.values()))
    extra = len(errors) - 1
    return message if extra == 0 else f"{message} (and {extra} more error{'s' * (extra > 1)})"


def _raise_if(errors: dict[str, str]) -> None:
    if errors:
        raise InvalidChangeBatch(_first_message(errors), errors)


# --- queries ----------------------------------------------------------------------------


@dataclass(frozen=True)
class ZoneListParams:
    page: int = 1
    page_size: int = 10
    sort_by: ZoneSortField = "name"
    sort_order: str = "asc"
    search: str | None = None
    type: str | None = None
    name: str | None = None
    description: str | None = None
    id: str | None = None


def _contains(
    column: ColumnElement[str] | QueryableAttribute[str], text: str
) -> ColumnElement[bool]:
    escaped = text.lower().replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
    return func.lower(column).like(f"%{escaped}%", escape="\\")


def list_zones(db: Session, owner: User, params: ZoneListParams) -> Page[HostedZoneSummary]:
    counts = (
        select(Record.zone_id, func.count(Record.id).label("record_count"))
        .group_by(Record.zone_id)
        .subquery()
    )
    count_col = func.coalesce(counts.c.record_count, 0)
    query = (
        select(HostedZone, count_col.label("record_count"))
        .outerjoin(counts, counts.c.zone_id == HostedZone.id)
        .where(HostedZone.owner_id == owner.id)
    )
    if params.search and params.search.strip():
        term = params.search.strip()
        query = query.where(
            or_(
                _contains(HostedZone.name, term),
                _contains(HostedZone.description, term),
                _contains(HostedZone.id, term),
            )
        )
    if params.type:
        query = query.where(HostedZone.type == params.type.upper())
    if params.name:
        query = query.where(_contains(HostedZone.name, params.name))
    if params.description:
        query = query.where(_contains(HostedZone.description, params.description))
    if params.id:
        query = query.where(_contains(HostedZone.id, params.id))

    total = db.scalar(select(func.count()).select_from(query.subquery())) or 0

    sort_columns = {
        "name": HostedZone.name,
        "type": HostedZone.type,
        "record_count": count_col,
        "description": HostedZone.description,
        "id": HostedZone.id,
        "created_at": HostedZone.created_at,
    }
    column = sort_columns[params.sort_by]
    primary = column.desc() if params.sort_order == "desc" else column.asc()
    query = query.order_by(primary, HostedZone.name.asc(), HostedZone.id.asc())
    query = query.offset((params.page - 1) * params.page_size).limit(params.page_size)

    items = [_summary(zone, count) for zone, count in db.execute(query).all()]
    return Page(items=items, total=total, page=params.page, page_size=params.page_size)


# --- commands ---------------------------------------------------------------------------


def create_zone(db: Session, owner: User, data: HostedZoneCreate) -> HostedZone:
    errors: dict[str, str] = {}
    name = ""
    try:
        name = normalize_domain_name(data.name)
    except DnsValueError as exc:
        errors["name"] = str(exc)

    if data.type == "PRIVATE":
        if not data.vpcs:
            errors["vpcs"] = "A private hosted zone must be associated with at least one VPC."
        errors.update(_validate_vpcs(data.vpcs))
    elif data.vpcs:
        errors["vpcs"] = "VPCs can only be associated with private hosted zones."
    errors.update(_validate_tags(data.tags))
    _raise_if(errors)

    zone = HostedZone(
        id=new_zone_id(),
        owner_id=owner.id,
        name=name,
        type=data.type,
        description=data.description.strip(),
        caller_reference=new_caller_reference(),
    )
    zone.vpcs = [
        HostedZoneVpc(vpc_region=v.region.strip(), vpc_id=v.vpc_id.strip()) for v in data.vpcs
    ]
    zone.tags = [HostedZoneTag(key=t.key.strip(), value=t.value) for t in data.tags]
    db.add(zone)
    db.flush()
    db.add_all(build_default_records(zone.id, zone.name))
    db.commit()
    return get_owned_zone(db, owner, zone.id)


def update_zone(db: Session, owner: User, zone_id: str, data: HostedZoneUpdate) -> HostedZone:
    zone = get_owned_zone(db, owner, zone_id)
    errors: dict[str, str] = {}
    if data.vpcs is not None:
        if zone.type != "PRIVATE":
            errors["vpcs"] = "VPCs can only be associated with private hosted zones."
        elif not data.vpcs:
            errors["vpcs"] = "A private hosted zone must be associated with at least one VPC."
        else:
            errors.update(_validate_vpcs(data.vpcs))
    _raise_if(errors)

    if data.description is not None:
        zone.description = data.description.strip()
    if data.vpcs is not None:
        zone.vpcs.clear()
        db.flush()
        zone.vpcs.extend(
            HostedZoneVpc(vpc_region=v.region.strip(), vpc_id=v.vpc_id.strip()) for v in data.vpcs
        )
    zone.updated_at = utcnow()
    db.commit()
    return get_owned_zone(db, owner, zone.id)


def replace_tags(db: Session, owner: User, zone_id: str, tags: list[Tag]) -> list[Tag]:
    zone = get_owned_zone(db, owner, zone_id)
    _raise_if(_validate_tags(tags))
    zone.tags.clear()
    db.flush()
    zone.tags.extend(HostedZoneTag(key=t.key.strip(), value=t.value) for t in tags)
    zone.updated_at = utcnow()
    db.commit()
    return [Tag(key=t.key, value=t.value) for t in get_owned_zone(db, owner, zone_id).tags]


def delete_zone(db: Session, owner: User, zone_id: str) -> HostedZone:
    zone = get_owned_zone(db, owner, zone_id)
    non_default = db.scalar(
        select(func.count(Record.id)).where(Record.zone_id == zone.id, Record.is_default.is_(False))
    )
    if non_default:
        raise HostedZoneNotEmpty()
    db.delete(zone)
    db.commit()
    return zone
