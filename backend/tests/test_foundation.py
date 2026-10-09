"""Phase 1: migrations, database pragmas, seed idempotency, ids, health and error contract."""

import re

from alembic import command
from alembic.autogenerate import compare_metadata
from alembic.migration import MigrationContext
from fastapi import FastAPI
from fastapi.testclient import TestClient
from pydantic import BaseModel
from sqlalchemy import Engine, func, inspect, select, text
from sqlalchemy.orm import Session

from app.errors import register_exception_handlers
from app.ids import name_servers_for_zone, new_zone_id, soa_value_for_zone
from app.models import Base, HostedZone, Record, User
from app.seed import DEMO_ZONES, seed

from .conftest import alembic_config

EXPECTED_TABLES = {
    "users",
    "sessions",
    "hosted_zones",
    "hosted_zone_vpcs",
    "hosted_zone_tags",
    "records",
}


# --- migrations -------------------------------------------------------------------------


def test_migration_creates_all_tables(engine: Engine) -> None:
    tables = set(inspect(engine).get_table_names())
    assert tables >= EXPECTED_TABLES
    assert "alembic_version" in tables


def test_migration_matches_models(engine: Engine) -> None:
    with engine.connect() as connection:
        diff = compare_metadata(MigrationContext.configure(connection), Base.metadata)
    assert diff == []


def test_migration_downgrade_and_reupgrade(db_url: str, engine: Engine) -> None:
    cfg = alembic_config(db_url)
    command.downgrade(cfg, "base")
    assert not EXPECTED_TABLES & set(inspect(engine).get_table_names())
    command.upgrade(cfg, "head")
    assert set(inspect(engine).get_table_names()) >= EXPECTED_TABLES


def test_records_unique_and_indexes(engine: Engine) -> None:
    insp = inspect(engine)
    uniques = {tuple(u["column_names"]) for u in insp.get_unique_constraints("records")}
    assert ("zone_id", "name", "type", "set_identifier") in uniques
    indexes = {tuple(i["column_names"]) for i in insp.get_indexes("records")}
    assert {("zone_id", "type"), ("zone_id", "name")} <= indexes
    zone_indexes = {tuple(i["column_names"]) for i in insp.get_indexes("hosted_zones")}
    assert ("owner_id", "name") in zone_indexes


# --- pragmas ----------------------------------------------------------------------------


def test_foreign_keys_pragma_on(db: Session) -> None:
    assert db.execute(text("PRAGMA foreign_keys")).scalar_one() == 1


def test_wal_journal_mode(db: Session) -> None:
    assert db.execute(text("PRAGMA journal_mode")).scalar_one().lower() == "wal"


def test_zone_delete_cascades_to_records(db: Session) -> None:
    seed(db)
    zone = db.scalar(select(HostedZone).where(HostedZone.name == "example.com."))
    assert zone is not None
    zone_id = zone.id
    db.execute(text("DELETE FROM hosted_zones WHERE id = :id"), {"id": zone_id})
    db.commit()
    remaining = db.scalar(select(func.count()).select_from(Record).where(Record.zone_id == zone_id))
    assert remaining == 0


# --- seed -------------------------------------------------------------------------------


def _counts(db: Session) -> tuple[int, int, int]:
    return (
        db.scalar(select(func.count()).select_from(User)) or 0,
        db.scalar(select(func.count()).select_from(HostedZone)) or 0,
        db.scalar(select(func.count()).select_from(Record)) or 0,
    )


def test_seed_is_idempotent(db: Session) -> None:
    first = seed(db)
    counts_after_first = _counts(db)
    second = seed(db)
    assert first == {"users": 1, "zones": len(DEMO_ZONES)}
    assert second == {"users": 0, "zones": 0}
    assert _counts(db) == counts_after_first


def test_seed_content(db: Session) -> None:
    seed(db)
    user = db.scalar(select(User).where(User.username == "demo"))
    assert user is not None
    assert user.display_name == "Demo User"
    assert user.account_id == "123456789012"

    zones = {z.name: z for z in db.scalars(select(HostedZone))}
    assert len(zones) > 10, "hosted zones list must paginate at page size 10"
    assert {"example.com.", "internal.corp.", "shop-demo.net."} <= zones.keys()
    assert zones["internal.corp."].type == "PRIVATE"
    assert len(zones["internal.corp."].vpcs) == 1

    for zone in zones.values():
        defaults = [r for r in zone.records if r.is_default]
        assert sorted(r.type for r in defaults) == ["NS", "SOA"]
        if zone.type == "PRIVATE":
            assert zone.vpcs, f"private zone {zone.name} needs a VPC"

    example_types = {r.type for r in zones["example.com."].records}
    assert {"A", "AAAA", "CNAME", "TXT", "MX", "NS", "PTR", "SRV", "CAA"} <= example_types
    assert len(zones["shop-demo.net."].records) >= 30


# --- ids --------------------------------------------------------------------------------


def test_zone_id_format() -> None:
    ids = {new_zone_id() for _ in range(50)}
    assert len(ids) == 50
    assert all(re.fullmatch(r"Z[A-Z0-9]{20}", zone_id) for zone_id in ids)


def test_name_servers_are_deterministic_and_route53_style() -> None:
    zone_id = "Z0123456789ABCDEFGHIJ"
    servers = name_servers_for_zone(zone_id)
    assert servers == name_servers_for_zone(zone_id)
    assert len(servers) == 4
    for server, tld in zip(servers, ["com", "net", "org", "co.uk"], strict=True):
        assert re.fullmatch(rf"ns-\d{{1,4}}\.awsdns-\d{{2}}\.{re.escape(tld)}\.", server)
    assert soa_value_for_zone(zone_id) == (
        f"{servers[0]} awsdns-hostmaster.amazon.com. 1 7200 900 1209600 86400"
    )


# --- http -------------------------------------------------------------------------------


def test_health(client: TestClient) -> None:
    response = client.get("/api/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_unknown_route_uses_error_contract(client: TestClient) -> None:
    response = client.get("/api/does-not-exist")
    assert response.status_code == 404
    assert response.json() == {
        "error": {"code": "NotFound", "message": "Not Found", "field_errors": {}}
    }


class _Item(BaseModel):
    name: str
    ttl: int


class _Batch(BaseModel):
    records: list[_Item]


def test_validation_errors_use_error_contract() -> None:
    app = FastAPI()
    register_exception_handlers(app)

    @app.post("/echo")
    def echo(batch: _Batch) -> _Batch:
        return batch

    response = TestClient(app).post("/echo", json={"records": [{"name": "a", "ttl": "x"}]})
    assert response.status_code == 422
    body = response.json()["error"]
    assert body["code"] == "ValidationError"
    assert "records[0].ttl" in body["field_errors"]


def test_seed_records_pass_validation(db: Session) -> None:
    """Seed data must obey the same rules the API enforces (and already be normalized)."""
    from app.dns_validation import validate_values

    seed(db)
    for record in db.scalars(select(Record)):
        if record.is_alias:
            assert record.ttl is None
            assert record.values == []
            continue
        normalized, errors = validate_values(record.type, record.values)
        assert errors == {}, (record.name, record.type, errors)
        assert normalized == record.values, (record.name, record.type)
