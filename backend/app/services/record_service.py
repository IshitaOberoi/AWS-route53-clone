"""DNS record business logic (AGENTS.md §4.2).

Validation is split in two:

* :func:`app.dns_validation` checks names and values in isolation (pure functions);
* this module checks everything that needs context — the zone apex, other records with the
  same name/type, routing-policy consistency, alias targets and default records.

All writes are atomic: a batch either passes validation completely and is inserted in a
single transaction, or nothing is written.
"""

from collections.abc import Iterable, Sequence
from dataclasses import dataclass, field
from typing import Literal

from sqlalchemy import String, cast, func, or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.catalog import REGION_CODES
from app.dns_validation import (
    ALIAS_RECORD_TYPES,
    DnsValueError,
    record_fqdn,
    validate_geo_location,
    validate_target_domain,
    validate_values,
)
from app.errors import InvalidChangeBatch, NoSuchRecord
from app.ids import new_record_id
from app.models import HostedZone, Record, User, utcnow
from app.schemas.record import RecordIn, RecordSortField
from app.services.zone_service import get_owned_zone

DEFAULT_NS_DELETE_MESSAGE = "A HostedZone must contain at least one NS record for the zone itself."
DEFAULT_SOA_DELETE_MESSAGE = "A HostedZone must contain exactly one SOA record."

# Within a record name, the console lists NS and SOA first.
_TYPE_ORDER = {"NS": 0, "SOA": 1}


def duplicate_message(fqdn: str, record_type: str) -> str:
    return (
        f"Tried to create resource record set [name='{fqdn}', type='{record_type}'] "
        "but it already exists"
    )


@dataclass
class _Candidate:
    """A validated record that is about to be written (or a record already in the zone)."""

    name: str
    type: str
    routing_policy: str
    set_identifier: str
    failover: str | None
    index: int | None = None  # position in the incoming batch, None for existing records


@dataclass
class _Validated:
    fields: dict[str, object] = field(default_factory=dict)
    errors: dict[str, str] = field(default_factory=dict)
    conflict: bool = False  # True when the only problem is a duplicate (→ HTTP 409)


def _prefix(index: int | None) -> str:
    return f"records[{index}]." if index is not None else ""


def _normalize_record(
    zone: HostedZone,
    data: RecordIn,
    index: int | None,
    *,
    existing: Record | None = None,
) -> _Validated:
    """Context-free validation + normalization of one record."""
    p = _prefix(index)
    result = _Validated()
    errors = result.errors

    # Type
    if existing is not None and existing.is_default:
        if data.type != existing.type:
            errors[f"{p}type"] = "You can't change the type of a default NS or SOA record."
    elif data.type == "SOA":
        errors[f"{p}type"] = "SOA records are created automatically and can't be added."

    # Name
    fqdn = zone.name
    try:
        fqdn = record_fqdn(data.name, zone.name)
    except DnsValueError as exc:
        errors[f"{p}name"] = str(exc)
    if existing is not None and existing.is_default and fqdn != existing.name:
        errors[f"{p}name"] = "You can't change the name of a default NS or SOA record."

    is_alias = data.is_alias
    ttl: int | None = data.ttl
    values: list[str] = []
    alias_target: str | None = None
    alias_target_type: str | None = None
    evaluate_target_health = False

    if is_alias:
        if data.type not in ALIAS_RECORD_TYPES:
            errors[f"{p}is_alias"] = "Alias records are supported only for A, AAAA and CNAME."
        if existing is not None and existing.is_default:
            errors[f"{p}is_alias"] = "Default NS and SOA records can't be alias records."
        if data.routing_policy == "MULTIVALUE":
            errors[f"{p}routing_policy"] = (
                "Multivalue answer routing is not supported for alias records."
            )
        target = (data.alias_target or "").strip()
        if not target:
            errors[f"{p}alias_target"] = "Choose the resource to route traffic to."
        else:
            try:
                alias_target = validate_target_domain(target).lower()
                if not alias_target.endswith("."):
                    alias_target += "."
            except DnsValueError as exc:
                errors[f"{p}alias_target"] = str(exc)
        if data.alias_target_type is None:
            errors[f"{p}alias_target_type"] = "Choose an endpoint type."
        alias_target_type = data.alias_target_type
        evaluate_target_health = data.evaluate_target_health
        if alias_target is not None and alias_target == fqdn:
            errors[f"{p}alias_target"] = "An alias record can't route traffic to itself."
        ttl = None
    else:
        if ttl is None:
            errors[f"{p}ttl"] = "TTL is required."
        values, value_errors = validate_values(data.type, data.values)
        for value_index, message in value_errors.items():
            errors[f"{p}values[{value_index}]"] = message
        if not values and not value_errors:
            errors[f"{p}values"] = "Enter at least one value."
        if data.type == "CNAME" and len(values) > 1:
            errors[f"{p}values"] = "A CNAME record can have only one value."
        if data.type == "SOA" and len(values) > 1:
            errors[f"{p}values"] = "An SOA record can have only one value."

    if data.type == "CNAME" and fqdn == zone.name and f"{p}name" not in errors:
        errors[f"{p}name"] = (
            f"RRSet of type CNAME with DNS name {fqdn} is not permitted at apex in zone {zone.name}"
        )

    # Routing policy
    policy = data.routing_policy
    set_identifier = data.set_identifier.strip()
    weight: int | None = None
    region: str | None = None
    failover: str | None = None
    geo_location: str | None = None
    health_check_id = (data.health_check_id or "").strip() or None

    if existing is not None and existing.is_default and policy != "SIMPLE":
        errors[f"{p}routing_policy"] = "Default NS and SOA records must use simple routing."

    if policy == "SIMPLE":
        set_identifier = ""
        health_check_id = None
    else:
        if not set_identifier:
            errors[f"{p}set_identifier"] = "Record ID is required for this routing policy."
        if policy == "WEIGHTED":
            if data.weight is None:
                errors[f"{p}weight"] = "Weight is required for weighted routing (0-255)."
            weight = data.weight
        elif policy == "LATENCY":
            if not data.region:
                errors[f"{p}region"] = "Region is required for latency routing."
            elif data.region not in REGION_CODES:
                errors[f"{p}region"] = f"Unknown region: {data.region}."
            region = data.region
        elif policy == "FAILOVER":
            if data.failover is None:
                errors[f"{p}failover"] = "Choose Primary or Secondary."
            failover = data.failover
        elif policy == "GEOLOCATION":
            if not data.geo_location:
                errors[f"{p}geo_location"] = "Location is required for geolocation routing."
            else:
                try:
                    geo_location = validate_geo_location(data.geo_location)
                except DnsValueError as exc:
                    errors[f"{p}geo_location"] = str(exc)

    result.fields = {
        "name": fqdn,
        "type": data.type,
        "ttl": ttl,
        "values": values,
        "routing_policy": policy,
        "set_identifier": set_identifier,
        "weight": weight,
        "region": region,
        "failover": failover,
        "geo_location": geo_location,
        "health_check_id": health_check_id,
        "is_alias": is_alias,
        "alias_target": alias_target,
        "alias_target_type": alias_target_type,
        "evaluate_target_health": evaluate_target_health,
    }
    return result


def _check_conflicts(
    zone: HostedZone,
    candidates: Sequence[tuple[_Candidate, _Validated]],
    existing: Iterable[Record],
) -> None:
    """Cross-record rules: duplicates, CNAME coexistence, routing-policy consistency."""
    others = [
        _Candidate(
            name=r.name,
            type=r.type,
            routing_policy=r.routing_policy,
            set_identifier=r.set_identifier,
            failover=r.failover,
        )
        for r in existing
    ]
    seen: list[_Candidate] = list(others)

    for candidate, result in candidates:
        if result.errors:
            continue
        p = _prefix(candidate.index)
        # Existing records passed in never include the record being updated.
        peers = [o for o in seen if o.name == candidate.name]
        same_type = [o for o in peers if o.type == candidate.type]

        # CNAME may not coexist with any other record of the same name, in either direction.
        if candidate.type == "CNAME" and any(o.type != "CNAME" for o in peers):
            result.errors[f"{p}name"] = (
                f"RRSet of type CNAME with DNS name {candidate.name} is not permitted as it "
                f"conflicts with other records with the same DNS name in zone {zone.name}"
            )
        elif candidate.type != "CNAME" and any(o.type == "CNAME" for o in peers):
            result.errors[f"{p}name"] = (
                f"RRSet of type {candidate.type} with DNS name {candidate.name} is not "
                f"permitted because a conflicting RRSet of type CNAME with the same DNS name "
                f"already exists in zone {zone.name}"
            )
        elif any(o.set_identifier == candidate.set_identifier for o in same_type):
            result.errors[f"{p}name"] = duplicate_message(candidate.name, candidate.type)
            result.conflict = True
        elif any(o.routing_policy != candidate.routing_policy for o in same_type):
            result.errors[f"{p}routing_policy"] = (
                f"RRSet with DNS name {candidate.name} and type {candidate.type} must use the "
                "same routing policy as the existing records with that name and type."
            )
        elif candidate.routing_policy == "SIMPLE" and same_type:
            result.errors[f"{p}name"] = duplicate_message(candidate.name, candidate.type)
            result.conflict = True
        elif candidate.failover and any(o.failover == candidate.failover for o in same_type):
            result.errors[f"{p}failover"] = (
                f"A {candidate.failover.lower()} failover record already exists for "
                f"{candidate.name} ({candidate.type})."
            )
        seen.append(candidate)


def _check_alias_targets(
    db: Session, zone: HostedZone, candidates: Sequence[tuple[_Candidate, _Validated]]
) -> None:
    names_in_zone = set(db.scalars(select(Record.name).where(Record.zone_id == zone.id)))
    names_in_zone.update(c.name for c, r in candidates if not r.errors)
    for candidate, result in candidates:
        if result.errors:
            continue
        fields = result.fields
        if fields["is_alias"] and fields["alias_target_type"] == "RECORD_IN_ZONE":
            target = str(fields["alias_target"])
            if target not in names_in_zone:
                result.errors[f"{_prefix(candidate.index)}alias_target"] = (
                    f"No record named {target} exists in this hosted zone."
                )


def _raise_for(results: Sequence[_Validated]) -> None:
    errors: dict[str, str] = {}
    for result in results:
        errors.update(result.errors)
    if not errors:
        return
    message = next(iter(errors.values()))
    extra = len(errors) - 1
    if extra:
        message = f"{message} (and {extra} more error{'s' * (extra > 1)})"
    only_conflicts = all(r.conflict for r in results if r.errors)
    raise InvalidChangeBatch(message, errors, status_code=409 if only_conflicts else 400)


def _candidate(result: _Validated, index: int | None) -> _Candidate:
    f = result.fields
    return _Candidate(
        name=str(f["name"]),
        type=str(f["type"]),
        routing_policy=str(f["routing_policy"]),
        set_identifier=str(f["set_identifier"]),
        failover=f["failover"] if isinstance(f["failover"], str) else None,
        index=index,
    )


def _zone_records(db: Session, zone: HostedZone) -> list[Record]:
    return list(db.scalars(select(Record).where(Record.zone_id == zone.id)))


# --- commands ---------------------------------------------------------------------------


def validate_batch(
    db: Session, zone: HostedZone, records: Sequence[RecordIn]
) -> list[dict[str, object]]:
    """Validate a batch against the zone. Returns normalized field dicts or raises."""
    results = [_normalize_record(zone, data, index) for index, data in enumerate(records)]
    pairs = [(_candidate(r, i), r) for i, r in enumerate(results)]
    _check_conflicts(zone, pairs, _zone_records(db, zone))
    _check_alias_targets(db, zone, pairs)
    _raise_for(results)
    return [r.fields for r in results]


def insert_validated(
    db: Session, zone: HostedZone, rows: Sequence[dict[str, object]]
) -> list[Record]:
    created = [Record(id=new_record_id(), zone_id=zone.id, **row) for row in rows]
    db.add_all(created)
    zone.updated_at = utcnow()
    try:
        db.commit()
    except IntegrityError as exc:  # pragma: no cover - race with a concurrent writer
        db.rollback()
        raise InvalidChangeBatch("One or more records already exist.", status_code=409) from exc
    return created


def create_records(
    db: Session, owner: User, zone_id: str, records: Sequence[RecordIn]
) -> list[Record]:
    zone = get_owned_zone(db, owner, zone_id)
    rows = validate_batch(db, zone, records)
    return insert_validated(db, zone, rows)


def get_record(db: Session, owner: User, zone_id: str, record_id: str) -> Record:
    zone = get_owned_zone(db, owner, zone_id)
    record = db.scalar(select(Record).where(Record.id == record_id, Record.zone_id == zone.id))
    if record is None:
        raise NoSuchRecord(record_id)
    return record


def update_record(db: Session, owner: User, zone_id: str, record_id: str, data: RecordIn) -> Record:
    zone = get_owned_zone(db, owner, zone_id)
    record = db.scalar(select(Record).where(Record.id == record_id, Record.zone_id == zone.id))
    if record is None:
        raise NoSuchRecord(record_id)

    result = _normalize_record(zone, data, None, existing=record)
    pairs = [(_candidate(result, None), result)]
    others = [r for r in _zone_records(db, zone) if r.id != record.id]
    _check_conflicts(zone, pairs, others)
    _check_alias_targets(db, zone, pairs)
    _raise_for([result])

    for key, value in result.fields.items():
        setattr(record, key, value)
    record.updated_at = utcnow()
    zone.updated_at = utcnow()
    try:
        db.commit()
    except IntegrityError as exc:  # pragma: no cover - race with a concurrent writer
        db.rollback()
        raise InvalidChangeBatch(
            duplicate_message(record.name, record.type), status_code=409
        ) from exc
    db.refresh(record)
    return record


def _ensure_deletable(record: Record) -> None:
    if record.is_default:
        message = DEFAULT_NS_DELETE_MESSAGE if record.type == "NS" else DEFAULT_SOA_DELETE_MESSAGE
        raise InvalidChangeBatch(message)


def delete_record(db: Session, owner: User, zone_id: str, record_id: str) -> None:
    record = get_record(db, owner, zone_id, record_id)
    _ensure_deletable(record)
    db.delete(record)
    db.commit()


def bulk_delete(db: Session, owner: User, zone_id: str, ids: Sequence[str]) -> int:
    """Delete several records atomically. Any unknown or default id → nothing deleted."""
    zone = get_owned_zone(db, owner, zone_id)
    unique_ids = list(dict.fromkeys(ids))
    records = list(
        db.scalars(select(Record).where(Record.zone_id == zone.id, Record.id.in_(unique_ids)))
    )
    found = {r.id for r in records}
    missing = [record_id for record_id in unique_ids if record_id not in found]
    if missing:
        raise NoSuchRecord(missing[0])
    for record in records:
        _ensure_deletable(record)
    for record in records:
        db.delete(record)
    zone.updated_at = utcnow()
    db.commit()
    return len(records)


# --- queries ----------------------------------------------------------------------------


@dataclass(frozen=True)
class RecordPage:
    items: list[Record]
    total: int
    page: int
    page_size: int


@dataclass(frozen=True)
class RecordListParams:
    page: int = 1
    page_size: int = 10
    sort_by: RecordSortField | None = None
    sort_order: Literal["asc", "desc"] = "asc"
    search: str | None = None
    types: tuple[str, ...] = ()
    routing_policies: tuple[str, ...] = ()
    alias: bool | None = None
    name: str | None = None
    value: str | None = None


def _like(text: str) -> str:
    escaped = text.lower().replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
    return f"%{escaped}%"


def dns_sort_key(name: str) -> tuple[str, ...]:
    """Canonical DNS order: compare labels right-to-left, so the apex sorts first."""
    return tuple(reversed(name.rstrip(".").split(".")))


def default_sort_key(record: Record) -> tuple[object, ...]:
    return (
        dns_sort_key(record.name),
        _TYPE_ORDER.get(record.type, 2),
        record.type,
        record.set_identifier,
    )


def list_records(db: Session, owner: User, zone_id: str, params: RecordListParams) -> RecordPage:
    zone = get_owned_zone(db, owner, zone_id)
    query = select(Record).where(Record.zone_id == zone.id)

    values_text = func.lower(cast(Record.values, String))
    alias_text = func.lower(func.coalesce(Record.alias_target, ""))
    if params.search and params.search.strip():
        pattern = _like(params.search.strip())
        query = query.where(
            or_(
                func.lower(Record.name).like(pattern, escape="\\"),
                values_text.like(pattern, escape="\\"),
                alias_text.like(pattern, escape="\\"),
            )
        )
    if params.types:
        query = query.where(Record.type.in_([t.upper() for t in params.types]))
    if params.routing_policies:
        query = query.where(Record.routing_policy.in_([r.upper() for r in params.routing_policies]))
    if params.alias is not None:
        query = query.where(Record.is_alias.is_(params.alias))
    if params.name:
        query = query.where(func.lower(Record.name).like(_like(params.name), escape="\\"))
    if params.value:
        pattern = _like(params.value)
        query = query.where(
            or_(values_text.like(pattern, escape="\\"), alias_text.like(pattern, escape="\\"))
        )

    records = list(db.scalars(query))
    # Record sets per zone are small (Route 53's default limit is 10,000), so sorting in
    # Python lets us use canonical DNS ordering, which SQL can't express simply.
    reverse = params.sort_order == "desc"
    if params.sort_by is None or params.sort_by == "name":
        records.sort(key=default_sort_key, reverse=reverse)
    elif params.sort_by == "type":
        records.sort(key=lambda r: (r.type, default_sort_key(r)), reverse=reverse)
    elif params.sort_by == "ttl":
        records.sort(
            key=lambda r: (r.ttl if r.ttl is not None else -1, default_sort_key(r)), reverse=reverse
        )
    else:
        records.sort(key=lambda r: (r.routing_policy, default_sort_key(r)), reverse=reverse)

    total = len(records)
    start = (params.page - 1) * params.page_size
    items = records[start : start + params.page_size]
    return RecordPage(items=items, total=total, page=params.page, page_size=params.page_size)
