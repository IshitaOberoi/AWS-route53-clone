"""Route 53-style identifier generators."""

import hashlib
import secrets
import string
import uuid

_ZONE_ID_ALPHABET = string.ascii_uppercase + string.digits
ZONE_ID_LENGTH = 21  # "Z" + 20 characters, e.g. Z04431362XG8IOPJVNR1Y

# Route 53 spreads the four delegation-set name servers over four TLDs.
_NS_TLDS: tuple[str, ...] = ("com", "net", "org", "co.uk")


def new_zone_id() -> str:
    """``Z`` followed by 20 random uppercase letters/digits."""
    return "Z" + "".join(secrets.choice(_ZONE_ID_ALPHABET) for _ in range(ZONE_ID_LENGTH - 1))


def new_record_id() -> str:
    return str(uuid.uuid4())


def new_caller_reference() -> str:
    return str(uuid.uuid4())


def name_servers_for_zone(zone_id: str) -> list[str]:
    """Deterministically derive four Route 53-style name servers from a zone id.

    Produces names such as ``ns-1536.awsdns-00.co.uk.`` — one per TLD, in the order
    ``.com``, ``.net``, ``.org``, ``.co.uk``. The same zone id always yields the same set.
    """
    digest = hashlib.sha256(zone_id.encode("ascii")).digest()
    servers: list[str] = []
    for index, tld in enumerate(_NS_TLDS):
        chunk = digest[index * 4 : index * 4 + 4]
        number = int.from_bytes(chunk[:2], "big") % 2048
        group = chunk[2] % 64
        servers.append(f"ns-{number}.awsdns-{group:02d}.{tld}.")
    return servers


def soa_value_for_zone(zone_id: str) -> str:
    """The default SOA value Route 53 writes for a new hosted zone."""
    primary = name_servers_for_zone(zone_id)[0]
    return f"{primary} awsdns-hostmaster.amazon.com. 1 7200 900 1209600 86400"


def hash_token(token: str) -> str:
    """SHA-256 hex digest used as the primary key of a session row."""
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def new_session_token() -> str:
    return secrets.token_urlsafe(32)
