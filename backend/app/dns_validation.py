"""Pure DNS name / value validation (no database, no FastAPI).

Every public function either returns a normalized value or raises :class:`DnsValueError`
with a short, user-facing message. The frontend mirrors these rules in
``frontend/src/lib/validation.ts`` so users see the same messages inline.
"""

import ipaddress
import re

MAX_DOMAIN_LENGTH = 253
MAX_LABEL_LENGTH = 63
MAX_TTL = 2_147_483_647
MAX_TXT_STRING = 255
MAX_UINT16 = 65_535
MAX_UINT32 = 4_294_967_295

CAA_TAGS: tuple[str, ...] = ("issue", "issuewild", "iodef")
USER_RECORD_TYPES: tuple[str, ...] = ("A", "AAAA", "CNAME", "TXT", "MX", "NS", "PTR", "SRV", "CAA")
ALIAS_RECORD_TYPES: tuple[str, ...] = ("A", "AAAA", "CNAME")

_LABEL_RE = re.compile(r"^[a-z0-9_]([a-z0-9_-]*[a-z0-9_])?$")
_TXT_STRING_RE = re.compile(r'"((?:[^"\\]|\\.)*)"')

# Continent codes Route 53 geolocation routing accepts, plus "*" (default location).
GEO_CONTINENTS: tuple[str, ...] = ("AF", "AN", "AS", "EU", "NA", "OC", "SA")
_GEO_RE = re.compile(r"^(\*|[A-Z]{2}|[A-Z]{2}-[A-Z0-9]{1,3})$")


class DnsValueError(ValueError):
    """Raised when a DNS name or value is invalid. ``str(exc)`` is the user-facing message."""


# --- names ------------------------------------------------------------------------------


def _to_ascii(name: str) -> str:
    """Lowercase and IDNA-encode any non-ASCII labels."""
    labels = name.split(".")
    out: list[str] = []
    for label in labels:
        if label.isascii():
            out.append(label.lower())
            continue
        try:
            out.append(label.encode("idna").decode("ascii").lower())
        except UnicodeError as exc:
            raise DnsValueError(f"Invalid internationalized label: {label}") from exc
    return ".".join(out)


def _check_labels(labels: list[str], *, allow_wildcard: bool) -> None:
    for index, label in enumerate(labels):
        if label == "":
            raise DnsValueError("Domain name labels cannot be empty (check for consecutive dots).")
        if label == "*":
            if allow_wildcard and index == 0:
                continue
            raise DnsValueError("A wildcard (*) is only allowed as the leftmost label.")
        if len(label) > MAX_LABEL_LENGTH:
            raise DnsValueError(f"Each label can have up to {MAX_LABEL_LENGTH} characters.")
        if label.startswith("-") or label.endswith("-"):
            raise DnsValueError("Labels cannot start or end with a hyphen.")
        if not _LABEL_RE.match(label):
            raise DnsValueError(
                "Labels can contain only letters, digits, hyphens (-) and underscores (_)."
            )


def normalize_domain_name(name: str) -> str:
    """Validate a hosted zone domain name. Returns lowercase ASCII FQDN *with* trailing dot."""
    text = name.strip()
    if text.endswith("."):
        text = text[:-1]
    if not text:
        raise DnsValueError("Enter a domain name.")
    ascii_name = _to_ascii(text)
    if len(ascii_name) > MAX_DOMAIN_LENGTH:
        raise DnsValueError(f"The domain name can have up to {MAX_DOMAIN_LENGTH} characters.")
    _check_labels(ascii_name.split("."), allow_wildcard=False)
    return ascii_name + "."


def record_fqdn(relative: str, zone_fqdn: str) -> str:
    """Turn the console's relative record name into a FQDN inside ``zone_fqdn``.

    ``""`` or ``"@"`` means the zone apex. A name ending in ``.`` is treated as absolute and
    must be inside the zone.
    """
    text = relative.strip()
    if text in ("", "@"):
        return zone_fqdn
    if text.endswith("."):
        fqdn = _to_ascii(text[:-1]) + "."
        if fqdn != zone_fqdn and not fqdn.endswith("." + zone_fqdn):
            raise DnsValueError(f"The record name must be in the hosted zone {zone_fqdn[:-1]}.")
    else:
        fqdn = f"{_to_ascii(text)}.{zone_fqdn}"
    if len(fqdn) - 1 > MAX_DOMAIN_LENGTH:
        raise DnsValueError(f"The record name can have up to {MAX_DOMAIN_LENGTH} characters.")
    _check_labels(fqdn[:-1].split("."), allow_wildcard=True)
    return fqdn


def relative_name(fqdn: str, zone_fqdn: str) -> str:
    """Inverse of :func:`record_fqdn` (apex → ``""``)."""
    if fqdn == zone_fqdn:
        return ""
    suffix = "." + zone_fqdn
    return fqdn[: -len(suffix)] if fqdn.endswith(suffix) else fqdn


def validate_target_domain(value: str) -> str:
    """A domain name used as a record value (CNAME, NS, PTR, MX/SRV targets)."""
    text = value.strip()
    if not text:
        raise DnsValueError("Enter a domain name.")
    bare = text[:-1] if text.endswith(".") else text
    if not bare:
        raise DnsValueError("Invalid domain name.")
    try:
        ascii_name = _to_ascii(bare)
    except DnsValueError as exc:
        raise DnsValueError("Invalid domain name.") from exc
    if len(ascii_name) > MAX_DOMAIN_LENGTH:
        raise DnsValueError("Invalid domain name: too long.")
    try:
        _check_labels(ascii_name.split("."), allow_wildcard=False)
    except DnsValueError as exc:
        raise DnsValueError(f"Invalid domain name. {exc}") from exc
    return ascii_name + ("." if text.endswith(".") else "")


# --- values -----------------------------------------------------------------------------


def _int_in_range(text: str, low: int, high: int, what: str) -> int:
    if not re.fullmatch(r"\d+", text):
        raise DnsValueError(f"{what} must be an integer between {low} and {high}.")
    number = int(text)
    if not low <= number <= high:
        raise DnsValueError(f"{what} must be an integer between {low} and {high}.")
    return number


def validate_a(value: str) -> str:
    try:
        return str(ipaddress.IPv4Address(value.strip()))
    except ValueError as exc:
        raise DnsValueError("Invalid IPv4 address.") from exc


def validate_aaaa(value: str) -> str:
    try:
        return ipaddress.IPv6Address(value.strip()).compressed
    except ValueError as exc:
        raise DnsValueError("Invalid IPv6 address.") from exc


def _escape_txt(text: str) -> str:
    return text.replace("\\", "\\\\").replace('"', '\\"')


def validate_txt(value: str) -> str:
    """One or more ``"..."`` strings, each ≤ 255 characters.

    A line that doesn't start with a double quote is treated as a single unquoted string: it
    is wrapped in quotes and any ``"`` / ``\\`` inside it are escaped.
    """
    text = value.strip()
    if not text.startswith('"'):
        if len(text) > MAX_TXT_STRING:
            raise DnsValueError(
                f"Each TXT string can have up to {MAX_TXT_STRING} characters. "
                'Split longer values into multiple quoted strings: "part1" "part2".'
            )
        return f'"{_escape_txt(text)}"'

    position = 0
    strings: list[str] = []
    while position < len(text):
        if text[position].isspace():
            position += 1
            continue
        match = _TXT_STRING_RE.match(text, position)
        if match is None:
            raise DnsValueError(
                'Invalid TXT value. Enclose each string in double quotes, e.g. "v=spf1 -all".'
            )
        content = match.group(1)
        unescaped = re.sub(r"\\(.)", r"\1", content)
        if len(unescaped) > MAX_TXT_STRING:
            raise DnsValueError(f"Each TXT string can have up to {MAX_TXT_STRING} characters.")
        strings.append(f'"{content}"')
        position = match.end()
    if not strings:
        raise DnsValueError("Enter a TXT value.")
    return " ".join(strings)


def validate_mx(value: str) -> str:
    parts = value.split()
    if len(parts) != 2:
        raise DnsValueError(
            'MX value must have the format "priority mail-server", e.g. "10 mail.example.com".'
        )
    priority = _int_in_range(parts[0], 0, MAX_UINT16, "Priority")
    return f"{priority} {validate_target_domain(parts[1])}"


def validate_srv(value: str) -> str:
    parts = value.split()
    if len(parts) != 4:
        raise DnsValueError(
            'SRV value must have the format "priority weight port target", '
            'e.g. "1 10 5269 xmpp-server.example.com."'
        )
    priority = _int_in_range(parts[0], 0, MAX_UINT16, "Priority")
    weight = _int_in_range(parts[1], 0, MAX_UINT16, "Weight")
    port = _int_in_range(parts[2], 0, MAX_UINT16, "Port")
    return f"{priority} {weight} {port} {validate_target_domain(parts[3])}"


def validate_caa(value: str) -> str:
    match = re.fullmatch(r"\s*(\S+)\s+(\S+)\s+(.+?)\s*", value)
    if match is None:
        raise DnsValueError(
            'CAA value must have the format: flags tag "value", e.g. 0 issue "amazon.com".'
        )
    flags = _int_in_range(match.group(1), 0, 255, "Flags")
    tag = match.group(2).lower()
    if tag not in CAA_TAGS:
        raise DnsValueError("CAA tag must be one of: issue, issuewild, iodef.")
    raw = match.group(3)
    if not (len(raw) >= 2 and raw.startswith('"') and raw.endswith('"')):
        raise DnsValueError('The CAA value must be enclosed in double quotes, e.g. "amazon.com".')
    inner = raw[1:-1]
    if re.search(r'(?<!\\)"', inner):
        raise DnsValueError("The CAA value must be a single quoted string.")
    if len(inner) > MAX_TXT_STRING:
        raise DnsValueError(f"The CAA value can have up to {MAX_TXT_STRING} characters.")
    return f'{flags} {tag} "{inner}"'


def validate_soa(value: str) -> str:
    parts = value.split()
    if len(parts) != 7:
        raise DnsValueError(
            "SOA value must have the format: primary-ns hostmaster serial refresh retry "
            "expire minimum."
        )
    mname = validate_target_domain(parts[0])
    rname = validate_target_domain(parts[1])
    names = ("Serial number", "Refresh time", "Retry interval", "Expire time", "Minimum TTL")
    numbers = [
        str(_int_in_range(part, 0, MAX_UINT32, label))
        for part, label in zip(parts[2:], names, strict=True)
    ]
    return " ".join([mname, rname, *numbers])


_VALIDATORS = {
    "A": validate_a,
    "AAAA": validate_aaaa,
    "CNAME": validate_target_domain,
    "TXT": validate_txt,
    "MX": validate_mx,
    "NS": validate_target_domain,
    "PTR": validate_target_domain,
    "SRV": validate_srv,
    "CAA": validate_caa,
    "SOA": validate_soa,
}


def validate_value(record_type: str, value: str) -> str:
    validator = _VALIDATORS.get(record_type)
    if validator is None:
        raise DnsValueError(f"Unsupported record type: {record_type}.")
    return validator(value)


def validate_values(record_type: str, values: list[str]) -> tuple[list[str], dict[int, str]]:
    """Validate every non-empty line. Returns (normalized values, {original index: message}).

    Empty / whitespace-only lines are dropped, as in the console textarea. Error indexes refer
    to positions in the list that was passed in, so the UI can point at the right line.
    """
    normalized: list[str] = []
    errors: dict[int, str] = {}
    for index, raw in enumerate(values):
        if not raw.strip():
            continue
        try:
            normalized.append(validate_value(record_type, raw))
        except DnsValueError as exc:
            errors[index] = str(exc)
    return normalized, errors


def validate_geo_location(code: str) -> str:
    text = code.strip().upper()
    if text in GEO_CONTINENTS or _GEO_RE.match(text):
        return text
    raise DnsValueError("Enter a continent code (e.g. EU), a country code (e.g. IN) or *.")
