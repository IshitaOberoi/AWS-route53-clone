"""Idempotent demo data.

Run with ``python -m app.seed``. Safe to run on every start: data is only inserted when
the users table is empty (a brand-new database). Once the demo user exists the seed does
nothing, so zones a reviewer deletes stay deleted across restarts and re-running never
duplicates anything.
"""

import logging
from dataclasses import dataclass, field

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import get_settings
from app.db import SessionLocal
from app.ids import new_caller_reference, new_record_id, new_zone_id
from app.models import HostedZone, HostedZoneTag, HostedZoneVpc, Record, User
from app.services.auth_service import hash_password
from app.services.zone_service import build_default_records

logger = logging.getLogger(__name__)

DEMO_USERNAME = "demo"
DEMO_PASSWORD = "demo1234"
DEMO_DISPLAY_NAME = "Demo User"
DEMO_ACCOUNT_ID = "123456789012"


@dataclass
class SeedRecord:
    name: str  # relative to the zone; "" = apex
    type: str
    values: list[str] = field(default_factory=list)
    ttl: int | None = 300
    routing_policy: str = "SIMPLE"
    set_identifier: str = ""
    weight: int | None = None
    region: str | None = None
    failover: str | None = None
    geo_location: str | None = None
    health_check_id: str | None = None
    alias_target: str | None = None
    alias_target_type: str | None = None
    evaluate_target_health: bool = False


@dataclass
class SeedZone:
    name: str  # without trailing dot
    type: str = "PUBLIC"
    description: str = ""
    vpcs: list[tuple[str, str]] = field(default_factory=list)
    tags: list[tuple[str, str]] = field(default_factory=list)
    records: list[SeedRecord] = field(default_factory=list)


EXAMPLE_COM = SeedZone(
    name="example.com",
    description="Primary marketing site",
    tags=[("Environment", "production"), ("Owner", "web-team")],
    records=[
        SeedRecord("", "A", ["192.0.2.1"]),
        SeedRecord("", "AAAA", ["2001:db8::1"]),
        SeedRecord("", "MX", ["10 mail1.example.com.", "20 mail2.example.com."], ttl=3600),
        SeedRecord(
            "",
            "TXT",
            ['"v=spf1 include:_spf.example.com ~all"', '"google-site-verification=a1b2c3d4"'],
        ),
        SeedRecord(
            "", "CAA", ['0 issue "amazon.com"', '0 iodef "mailto:security@example.com"'], ttl=3600
        ),
        SeedRecord("www", "CNAME", ["example.com."]),
        SeedRecord("mail1", "A", ["192.0.2.25"]),
        SeedRecord("mail2", "A", ["192.0.2.26"]),
        SeedRecord(
            "api",
            "A",
            ["192.0.2.20"],
            ttl=60,
            routing_policy="WEIGHTED",
            set_identifier="api-blue",
            weight=70,
        ),
        SeedRecord(
            "api",
            "A",
            ["192.0.2.21"],
            ttl=60,
            routing_policy="WEIGHTED",
            set_identifier="api-green",
            weight=30,
        ),
        SeedRecord(
            "cdn",
            "A",
            ttl=None,
            alias_target="d111111abcdef8.cloudfront.net.",
            alias_target_type="CLOUDFRONT",
        ),
        SeedRecord("_dmarc", "TXT", ['"v=DMARC1; p=quarantine; rua=mailto:dmarc@example.com"']),
        SeedRecord(
            "_sip._tcp", "SRV", ["10 60 5060 sip.example.com.", "20 0 5060 sip2.example.com."]
        ),
        SeedRecord(
            "dev", "NS", ["ns1.dev-dns.example.net.", "ns2.dev-dns.example.net."], ttl=86400
        ),
        SeedRecord("10.2.0.192.in-addr", "PTR", ["mail1.example.com."]),
    ],
)

INTERNAL_CORP = SeedZone(
    name="internal.corp",
    type="PRIVATE",
    description="Private zone for internal services",
    vpcs=[("us-east-1", "vpc-0a1b2c3d4e5f60001")],
    tags=[("Environment", "production")],
    records=[
        SeedRecord("db", "A", ["10.0.1.10"]),
        SeedRecord("app", "A", ["10.0.1.20", "10.0.1.21"]),
        SeedRecord("cache", "CNAME", ["redis-primary.internal.corp."]),
        SeedRecord("redis-primary", "A", ["10.0.2.15"]),
    ],
)


def _shop_records() -> list[SeedRecord]:
    records = [
        SeedRecord("", "A", ["203.0.113.10"]),
        SeedRecord("www", "CNAME", ["shop-demo.net."]),
        SeedRecord("", "MX", ["10 inbound-smtp.us-east-1.amazonaws.com."]),
        SeedRecord("", "TXT", ['"v=spf1 include:amazonses.com ~all"']),
        SeedRecord(
            "checkout",
            "A",
            ["203.0.113.40"],
            routing_policy="FAILOVER",
            set_identifier="checkout-primary",
            failover="PRIMARY",
            health_check_id="hc-checkout-01",
        ),
        SeedRecord(
            "checkout",
            "A",
            ["203.0.113.41"],
            routing_policy="FAILOVER",
            set_identifier="checkout-secondary",
            failover="SECONDARY",
        ),
        SeedRecord(
            "cdn",
            "A",
            ["198.51.100.200"],
            routing_policy="LATENCY",
            set_identifier="cdn-us-east-1",
            region="us-east-1",
        ),
        SeedRecord(
            "cdn",
            "A",
            ["198.51.100.201"],
            routing_policy="LATENCY",
            set_identifier="cdn-ap-south-1",
            region="ap-south-1",
        ),
        SeedRecord(
            "eu",
            "A",
            ["198.51.100.150"],
            routing_policy="GEOLOCATION",
            set_identifier="eu-visitors",
            geo_location="EU",
        ),
    ]
    records.extend(
        SeedRecord(f"web-{index:02d}", "A", [f"198.51.100.{index}"]) for index in range(1, 33)
    )
    return records


SHOP_DEMO_NET = SeedZone(
    name="shop-demo.net",
    description="E-commerce demo storefront",
    tags=[("Environment", "staging"), ("CostCenter", "4012")],
    records=_shop_records(),
)

EXTRA_ZONES: list[SeedZone] = [
    SeedZone("acme-corp.io", description="Corporate website"),
    SeedZone("api.acme-corp.io", description="Delegated API subdomain"),
    SeedZone("blog-platform.dev"),
    SeedZone("cloudnative.app", description="Kubernetes ingress endpoints"),
    SeedZone(
        "corp.internal",
        type="PRIVATE",
        description="Corporate private DNS",
        vpcs=[("ap-south-1", "vpc-0f9e8d7c6b5a40402")],
    ),
    SeedZone("data-lake.cloud"),
    SeedZone("demo-store.shop", description="Seasonal campaign"),
    SeedZone("example.org", description="Legacy domain"),
    SeedZone("mobile-backend.net"),
    SeedZone("my-startup.co"),
    SeedZone("portfolio.site", description="Personal portfolio"),
    SeedZone(
        "staging.local",
        type="PRIVATE",
        vpcs=[("us-west-2", "vpc-07c3d5e9a1b2f0303")],
    ),
    SeedZone("status-page.net", description="Public status page"),
]

DEMO_ZONES: list[SeedZone] = [EXAMPLE_COM, INTERNAL_CORP, SHOP_DEMO_NET, *EXTRA_ZONES]


def _fqdn(relative: str, zone_fqdn: str) -> str:
    return f"{relative}.{zone_fqdn}" if relative else zone_fqdn


def _create_zone(db: Session, owner: User, spec: SeedZone) -> HostedZone:
    zone_fqdn = f"{spec.name}."
    zone = HostedZone(
        id=new_zone_id(),
        owner_id=owner.id,
        name=zone_fqdn,
        type=spec.type,
        description=spec.description,
        caller_reference=new_caller_reference(),
    )
    zone.vpcs = [HostedZoneVpc(vpc_region=region, vpc_id=vpc) for region, vpc in spec.vpcs]
    zone.tags = [HostedZoneTag(key=key, value=value) for key, value in spec.tags]
    db.add(zone)
    db.flush()
    db.add_all(build_default_records(zone.id, zone_fqdn))
    for rec in spec.records:
        is_alias = rec.alias_target is not None
        db.add(
            Record(
                id=new_record_id(),
                zone_id=zone.id,
                name=_fqdn(rec.name, zone_fqdn),
                type=rec.type,
                ttl=None if is_alias else rec.ttl,
                values=[] if is_alias else rec.values,
                routing_policy=rec.routing_policy,
                set_identifier=rec.set_identifier,
                weight=rec.weight,
                region=rec.region,
                failover=rec.failover,
                geo_location=rec.geo_location,
                health_check_id=rec.health_check_id,
                is_alias=is_alias,
                alias_target=rec.alias_target,
                alias_target_type=rec.alias_target_type,
                evaluate_target_health=rec.evaluate_target_health,
            )
        )
    return zone


def seed(db: Session) -> dict[str, int]:
    """Insert the demo user and zones into an empty database. Returns what was created."""
    created = {"users": 0, "zones": 0}
    if db.scalar(select(User.id).limit(1)) is not None:
        return created

    user = User(
        username=DEMO_USERNAME,
        password_hash=hash_password(DEMO_PASSWORD),
        display_name=DEMO_DISPLAY_NAME,
        account_id=DEMO_ACCOUNT_ID,
    )
    db.add(user)
    db.flush()
    created["users"] += 1

    for spec in DEMO_ZONES:
        _create_zone(db, user, spec)
        created["zones"] += 1

    db.commit()
    return created


def main() -> None:
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s: %(message)s")
    if not get_settings().seed_demo_data:
        logger.info("SEED_DEMO_DATA is false; skipping demo data.")
        return
    with SessionLocal() as db:
        result = seed(db)
    logger.info("Seed complete: created %(users)s user(s), %(zones)s zone(s).", result)


if __name__ == "__main__":
    main()
