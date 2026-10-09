"""BIND zone file import / export (bonus features, AGENTS.md §5 and §8).

Parsing is pure: :func:`parse_zone_file` turns zone file text into record sets plus a list of
skipped lines and errors, each tied to a line number. The import service then validates
those record sets with exactly the same rules as the API (``record_service.validate_batch``)
and inserts them in one transaction, or not at all.
"""

import json
import re
from collections.abc import Iterator, Sequence
from dataclasses import dataclass, field
from typing import Any, cast

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.dns_validation import GEO_CONTINENTS, USER_RECORD_TYPES
from app.errors import InvalidChangeBatch
from app.models import HostedZone, Record, User
from app.schemas.record import RecordIn, RecordType
from app.services import record_service
from app.services.zone_service import get_owned_zone, record_count

DEFAULT_IMPORT_TTL = 300
EXPORT_DEFAULT_TTL = 300
KNOWN_CLASSES = ("IN", "CH", "HS", "CS")
_TYPE_TOKEN_RE = re.compile(r"^[A-Z][A-Z0-9]*$")
_TTL_RE = re.compile(r"^(\d+[smhdwSMHDW]?)+$")
_TTL_UNITS = {"s": 1, "m": 60, "h": 3600, "d": 86400, "w": 604800}


@dataclass
class LineIssue:
    line: int
    message: str


@dataclass
class ParsedRecordSet:
    """All lines of a zone file that share (name, type) form one Route 53 record set."""

    name: str  # FQDN with trailing dot
    type: str
    ttl: int
    values: list[str] = field(default_factory=list)
    lines: list[int] = field(default_factory=list)


@dataclass
class ParseResult:
    record_sets: list[ParsedRecordSet] = field(default_factory=list)
    skipped: list[LineIssue] = field(default_factory=list)
    errors: list[LineIssue] = field(default_factory=list)


@dataclass
class _LogicalLine:
    number: int  # 1-based line where the entry starts
    tokens: list[str]
    blank_owner: bool


# --- tokenizer --------------------------------------------------------------------------


def _logical_lines(text: str) -> Iterator[_LogicalLine | LineIssue]:
    """Strip comments, join parenthesised continuation lines and split into tokens.

    Quoted strings (with ``\\"`` escapes) are kept as single tokens including their quotes.
    """
    tokens: list[str] = []
    depth = 0
    start_line = 0
    blank_owner = False

    for number, raw in enumerate(text.splitlines(), start=1):
        if depth == 0:
            tokens = []
            start_line = number
            blank_owner = bool(raw) and raw[0] in " \t"
        position = 0
        length = len(raw)
        while position < length:
            char = raw[position]
            if char == ";":
                break
            if char in " \t\r":
                position += 1
                continue
            if char == "(":
                depth += 1
                position += 1
                continue
            if char == ")":
                depth -= 1
                position += 1
                if depth < 0:
                    yield LineIssue(number, "Unbalanced closing parenthesis.")
                    depth = 0
                continue
            if char == '"':
                end = position + 1
                while end < length and raw[end] != '"':
                    end += 2 if raw[end] == "\\" else 1
                if end >= length:
                    yield LineIssue(number, "Unterminated quoted string.")
                    tokens = []
                    depth = 0
                    break
                tokens.append(raw[position : end + 1])
                position = end + 1
                continue
            end = position
            while end < length and raw[end] not in ' \t\r;()"':
                end += 1
            tokens.append(raw[position:end])
            position = end
        if depth == 0 and tokens:
            yield _LogicalLine(start_line, tokens, blank_owner)
            tokens = []
    if depth > 0:
        yield LineIssue(start_line, "Missing closing parenthesis.")


# --- helpers ----------------------------------------------------------------------------


def _parse_ttl(token: str) -> int | None:
    """``3600``, ``1h``, ``1h30m``, ``1w`` → seconds; ``None`` if not a TTL."""
    if not _TTL_RE.match(token):
        return None
    if token.isdigit():
        return int(token)
    total = 0
    for amount, unit in re.findall(r"(\d+)([smhdwSMHDW]?)", token):
        total += int(amount) * _TTL_UNITS[(unit or "s").lower()]
    return total


def _absolute(name: str, origin: str) -> str:
    if name == "@":
        return origin
    if name.endswith("."):
        return name.lower()
    return f"{name}.{origin}".lower()


def _qualify_rdata(record_type: str, rdata: list[str], origin: str) -> list[str]:
    """Make domain names inside rdata absolute, as BIND does for unqualified names."""
    out = list(rdata)
    if record_type in ("CNAME", "NS", "PTR") and len(out) == 1:
        out[0] = _absolute(out[0], origin)
    elif record_type == "MX" and len(out) == 2:
        out[1] = _absolute(out[1], origin)
    elif record_type == "SRV" and len(out) == 4:
        out[3] = _absolute(out[3], origin)
    return out


def _in_zone(fqdn: str, zone_fqdn: str) -> bool:
    return fqdn == zone_fqdn or fqdn.endswith("." + zone_fqdn)


# --- parser -----------------------------------------------------------------------------


def parse_zone_file(text: str, zone_fqdn: str) -> ParseResult:
    result = ParseResult()
    origin = zone_fqdn
    default_ttl: int | None = None
    last_owner: str | None = None
    sets: dict[tuple[str, str], ParsedRecordSet] = {}

    for entry in _logical_lines(text):
        if isinstance(entry, LineIssue):
            result.errors.append(entry)
            continue
        tokens = entry.tokens
        line = entry.number
        head = tokens[0].upper()

        if head.startswith("$"):
            if head == "$ORIGIN" and len(tokens) == 2:
                origin = _absolute(tokens[1], origin)
                if not origin.endswith("."):
                    origin += "."
            elif head == "$TTL" and len(tokens) == 2:
                directive_ttl = _parse_ttl(tokens[1])
                if directive_ttl is None:
                    result.errors.append(LineIssue(line, f"Invalid $TTL value: {tokens[1]}"))
                else:
                    default_ttl = directive_ttl
            elif head in ("$ORIGIN", "$TTL"):
                result.errors.append(LineIssue(line, f"{head} takes exactly one argument."))
            else:
                result.skipped.append(LineIssue(line, f"Unsupported directive {tokens[0]}."))
            continue

        # Owner name
        if entry.blank_owner:
            if last_owner is None:
                result.errors.append(LineIssue(line, "Record has no owner name."))
                continue
            owner = last_owner
            rest = tokens
        else:
            owner = _absolute(tokens[0], origin)
            rest = tokens[1:]
        last_owner = owner

        # [TTL] [CLASS] TYPE, with TTL and class in either order
        ttl: int | None = None
        record_class = "IN"
        index = 0
        while index < len(rest) and index < 2:
            token = rest[index]
            parsed_ttl = _parse_ttl(token)
            if parsed_ttl is not None and ttl is None:
                ttl = parsed_ttl
            elif token.upper() in KNOWN_CLASSES:
                record_class = token.upper()
            else:
                break
            index += 1
        if index >= len(rest):
            result.errors.append(LineIssue(line, "Record type is missing."))
            continue
        record_type = rest[index].upper()
        rdata = rest[index + 1 :]

        if record_class != "IN":
            result.errors.append(
                LineIssue(line, f"Only class IN is supported (got {record_class}).")
            )
            continue
        if not _TYPE_TOKEN_RE.match(record_type):
            result.errors.append(LineIssue(line, f"Invalid record type: {rest[index]}"))
            continue
        if not _in_zone(owner, zone_fqdn):
            result.errors.append(
                LineIssue(line, f"{owner} is not in the hosted zone {zone_fqdn[:-1]}.")
            )
            continue
        if record_type == "SOA":
            reason = (
                "SOA record at the zone apex is managed by Route 53."
                if owner == zone_fqdn
                else "SOA records are only allowed at the zone apex."
            )
            result.skipped.append(LineIssue(line, reason))
            continue
        if record_type == "NS" and owner == zone_fqdn:
            result.skipped.append(
                LineIssue(line, "NS records at the zone apex are managed by Route 53.")
            )
            continue
        if record_type not in USER_RECORD_TYPES:
            result.skipped.append(LineIssue(line, f"Unsupported record type {record_type}."))
            continue
        if not rdata:
            result.errors.append(LineIssue(line, f"{record_type} record has no value."))
            continue

        value = " ".join(_qualify_rdata(record_type, rdata, origin))
        effective_ttl = ttl if ttl is not None else default_ttl
        key = (owner, record_type)
        if key not in sets:
            sets[key] = ParsedRecordSet(
                name=owner,
                type=record_type,
                ttl=effective_ttl if effective_ttl is not None else DEFAULT_IMPORT_TTL,
            )
        record_set = sets[key]
        record_set.values.append(value)
        record_set.lines.append(line)

    result.record_sets = list(sets.values())
    return result


# --- import -----------------------------------------------------------------------------


@dataclass
class ImportOutcome:
    created: int
    skipped: list[LineIssue]


_FIELD_RE = re.compile(r"^records\[(\d+)\](?:\.values\[(\d+)\])?")


def _line_errors(
    field_errors: dict[str, str], record_sets: Sequence[ParsedRecordSet]
) -> list[LineIssue]:
    issues: list[LineIssue] = []
    for key, message in field_errors.items():
        match = _FIELD_RE.match(key)
        if match is None:
            issues.append(LineIssue(0, message))
            continue
        record_set = record_sets[int(match.group(1))]
        value_index = match.group(2)
        line = (
            record_set.lines[int(value_index)]
            if value_index is not None and int(value_index) < len(record_set.lines)
            else record_set.lines[0]
        )
        issues.append(LineIssue(line, message))
    return sorted(issues, key=lambda issue: issue.line)


def _raise_line_errors(errors: list[LineIssue]) -> None:
    ordered = sorted(errors, key=lambda issue: issue.line)
    field_errors: dict[str, str] = {}
    for issue in ordered:
        field_errors.setdefault(f"line {issue.line}", issue.message)
    first = ordered[0]
    count = len(ordered)
    summary = f"The zone file contains {count} error{'s' * (count > 1)}. "
    summary += f"Line {first.line}: {first.message}" if first.line else first.message
    raise InvalidChangeBatch(summary, field_errors)


def import_zone_file(db: Session, owner: User, zone_id: str, text: str) -> ImportOutcome:
    zone = get_owned_zone(db, owner, zone_id)
    parsed = parse_zone_file(text, zone.name)
    if parsed.errors:
        _raise_line_errors(parsed.errors)
    if not parsed.record_sets:
        raise InvalidChangeBatch(
            "The zone file doesn't contain any records that can be imported.",
            {"zone_file": "No importable records found."},
        )

    batch = [
        RecordIn(name=rs.name, type=cast(RecordType, rs.type), ttl=rs.ttl, values=rs.values)
        for rs in parsed.record_sets
    ]
    try:
        rows = record_service.validate_batch(db, zone, batch)
    except InvalidChangeBatch as exc:
        _raise_line_errors(_line_errors(exc.field_errors, parsed.record_sets))
        raise  # pragma: no cover - _raise_line_errors always raises
    created = record_service.insert_validated(db, zone, rows)
    return ImportOutcome(created=len(created), skipped=parsed.skipped)


# --- export -----------------------------------------------------------------------------


def _zone_records(db: Session, zone: HostedZone) -> list[Record]:
    records = list(db.scalars(select(Record).where(Record.zone_id == zone.id)))
    return sorted(records, key=record_service.default_sort_key)


def _geo(code: str) -> dict[str, str]:
    if code == "*":
        return {"CountryCode": "*"}
    if code in GEO_CONTINENTS:
        return {"ContinentCode": code}
    if "-" in code:
        country, subdivision = code.split("-", 1)
        return {"CountryCode": country, "SubdivisionCode": subdivision}
    return {"CountryCode": code}


def _record_json(record: Record, zone: HostedZone) -> dict[str, Any]:
    item: dict[str, Any] = {"Name": record.name, "Type": record.type}
    if record.set_identifier:
        item["SetIdentifier"] = record.set_identifier
    if record.weight is not None:
        item["Weight"] = record.weight
    if record.region:
        item["Region"] = record.region
    if record.failover:
        item["Failover"] = record.failover
    if record.geo_location:
        item["GeoLocation"] = _geo(record.geo_location)
    if record.routing_policy == "MULTIVALUE":
        item["MultiValueAnswer"] = True
    if record.is_alias:
        item["AliasTarget"] = {
            "HostedZoneId": zone.id if record.alias_target_type == "RECORD_IN_ZONE" else None,
            "DNSName": record.alias_target,
            "EvaluateTargetHealth": record.evaluate_target_health,
            "TargetType": record.alias_target_type,
        }
    else:
        item["TTL"] = record.ttl
        item["ResourceRecords"] = [{"Value": value} for value in record.values]
    if record.health_check_id:
        item["HealthCheckId"] = record.health_check_id
    return item


def export_json(db: Session, owner: User, zone_id: str) -> str:
    zone = get_owned_zone(db, owner, zone_id)
    records = _zone_records(db, zone)
    document = {
        "hostedZone": {
            "Id": f"/hostedzone/{zone.id}",
            "Name": zone.name,
            "CallerReference": zone.caller_reference,
            "Config": {"Comment": zone.description, "PrivateZone": zone.type == "PRIVATE"},
            "ResourceRecordSetCount": record_count(db, zone.id),
            "VPCs": [{"VPCRegion": v.vpc_region, "VPCId": v.vpc_id} for v in zone.vpcs],
            "Tags": [{"Key": t.key, "Value": t.value} for t in zone.tags],
        },
        "records": [_record_json(record, zone) for record in records],
    }
    return json.dumps(document, indent=2) + "\n"


def _policy_note(record: Record) -> str:
    parts = [record.routing_policy, f"SetIdentifier={record.set_identifier}"]
    if record.weight is not None:
        parts.append(f"Weight={record.weight}")
    if record.region:
        parts.append(f"Region={record.region}")
    if record.failover:
        parts.append(f"Failover={record.failover}")
    if record.geo_location:
        parts.append(f"Location={record.geo_location}")
    if record.health_check_id:
        parts.append(f"HealthCheckId={record.health_check_id}")
    return " ".join(parts)


def export_bind(db: Session, owner: User, zone_id: str) -> str:
    """Standard BIND zone file. Alias and non-simple routing records become comments,
    because BIND has no way to express them."""
    zone = get_owned_zone(db, owner, zone_id)
    records = _zone_records(db, zone)
    width = max([len(r.name) for r in records] + [len(zone.name)])
    lines = [
        f"; Zone file for {zone.name[:-1]}",
        f"; Exported from Route 53 Clone (hosted zone {zone.id})",
        f"$ORIGIN {zone.name}",
        f"$TTL {EXPORT_DEFAULT_TTL}",
    ]
    commented: list[str] = []
    for record in records:
        if record.is_alias:
            target_health = "Yes" if record.evaluate_target_health else "No"
            note = f"; ALIAS {record.name} {record.type} -> {record.alias_target}"
            note += f" ({record.alias_target_type}, EvaluateTargetHealth={target_health})"
            if record.routing_policy != "SIMPLE":
                note += f" [{_policy_note(record)}]"
            commented.append(note)
            continue
        if record.routing_policy != "SIMPLE":
            for value in record.values:
                commented.append(
                    f"; {_policy_note(record)}: {record.name} {record.ttl} IN {record.type} {value}"
                )
            continue
        for value in record.values:
            lines.append(f"{record.name:<{width}}  {record.ttl:<7} IN  {record.type:<5} {value}")
    if commented:
        lines.append("")
        lines.append(
            "; The following records use Route 53 features that BIND can't express "
            "(alias records and non-simple routing policies):"
        )
        lines.extend(commented)
    return "\n".join(lines) + "\n"


def export_filename(zone: HostedZone, file_format: str) -> str:
    extension = "json" if file_format == "json" else "zone"
    return f"{zone.name.rstrip('.')}.{extension}"
