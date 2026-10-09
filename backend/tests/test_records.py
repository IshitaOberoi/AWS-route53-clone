"""Records API (AGENTS.md §4.2, §5)."""

from typing import Any

import pytest
from fastapi.testclient import TestClient

from .conftest import create_zone


def url(zone: dict[str, Any], suffix: str = "") -> str:
    return f"/api/hosted-zones/{zone['id']}/records{suffix}"


def post(client: TestClient, zone: dict[str, Any], *records: dict[str, Any]) -> Any:
    return client.post(url(zone), json={"records": list(records)})


def create_ok(client: TestClient, zone: dict[str, Any], **record: Any) -> dict[str, Any]:
    response = post(client, zone, record)
    assert response.status_code == 201, response.text
    item: dict[str, Any] = response.json()["items"][0]
    return item


def listing(client: TestClient, zone: dict[str, Any], **params: Any) -> dict[str, Any]:
    response = client.get(url(zone), params=params)
    assert response.status_code == 200, response.text
    body: dict[str, Any] = response.json()
    return body


def error(response: Any) -> dict[str, Any]:
    body: dict[str, Any] = response.json()["error"]
    return body


# --- each of the 9 types: one valid + one invalid -----------------------------------------

TYPE_CASES = [
    ("A", ["192.0.2.235", "192.0.2.236"], ["192.0.2.300"]),
    ("AAAA", ["2001:0db8::0001"], ["192.0.2.1"]),
    ("CNAME", ["target.example.net"], ["not a domain"]),
    ("TXT", ['"Sample Text Entries"', "unquoted text"], ['"broken']),
    ("MX", ["10 mailserver.example.com"], ["mailserver.example.com"]),
    ("NS", ["ns1.example.org.", "ns2.example.org."], ["bad_ns!"]),
    ("PTR", ["host.example.com"], ["host with space"]),
    ("SRV", ["1 10 5269 xmpp-server.example.com."], ["1 10 xmpp-server.example.com."]),
    ("CAA", ['0 issue "caauthority.com"'], ["0 issue caauthority.com"]),
]


@pytest.mark.parametrize(("rtype", "good", "_bad"), TYPE_CASES)
def test_create_valid_record_each_type(
    auth_client: TestClient, zone: dict[str, Any], rtype: str, good: list[str], _bad: list[str]
) -> None:
    record = create_ok(
        auth_client, zone, name=f"rec-{rtype.lower()}", type=rtype, values=good, ttl=600
    )
    assert record["name"] == f"rec-{rtype.lower()}.example.com."
    assert record["type"] == rtype
    assert record["ttl"] == 600
    assert len(record["values"]) == len(good)
    assert record["routing_policy"] == "SIMPLE"
    assert record["is_default"] is False
    fetched = auth_client.get(url(zone, f"/{record['id']}")).json()
    assert fetched == record


@pytest.mark.parametrize(("rtype", "_good", "bad"), TYPE_CASES)
def test_create_invalid_record_each_type(
    auth_client: TestClient, zone: dict[str, Any], rtype: str, _good: list[str], bad: list[str]
) -> None:
    response = post(auth_client, zone, {"name": "bad", "type": rtype, "values": ["", *bad]})
    assert response.status_code == 400, response.text
    body = error(response)
    assert body["code"] == "InvalidChangeBatch"
    # Index 1: the blank first line is skipped but indexes still point at the input lines.
    assert "records[0].values[1]" in body["field_errors"]
    assert listing(auth_client, zone)["total"] == 2


def test_value_normalization(auth_client: TestClient, zone: dict[str, Any]) -> None:
    aaaa = create_ok(auth_client, zone, name="v6", type="AAAA", values=["2001:0db8:0000::0001"])
    assert aaaa["values"] == ["2001:db8::1"]
    txt = create_ok(
        auth_client, zone, name="t", type="TXT", values=["hello world", "  ", '"a" "b"']
    )
    assert txt["values"] == ['"hello world"', '"a" "b"']


def test_values_required(auth_client: TestClient, zone: dict[str, Any]) -> None:
    response = post(auth_client, zone, {"name": "x", "type": "A", "values": ["", " "]})
    assert response.status_code == 400
    assert error(response)["field_errors"] == {"records[0].values": "Enter at least one value."}


def test_soa_cannot_be_created(auth_client: TestClient, zone: dict[str, Any]) -> None:
    response = post(auth_client, zone, {"name": "x", "type": "SOA", "values": ["a. b. 1 2 3 4 5"]})
    assert response.status_code == 400
    assert "records[0].type" in error(response)["field_errors"]


def test_unknown_type_422(auth_client: TestClient, zone: dict[str, Any]) -> None:
    response = post(auth_client, zone, {"name": "x", "type": "SPF", "values": ["x"]})
    assert response.status_code == 422
    assert "records[0].type" in error(response)["field_errors"]


def test_wildcard_and_apex(auth_client: TestClient, zone: dict[str, Any]) -> None:
    assert create_ok(auth_client, zone, name="*", type="A", values=["192.0.2.1"])["name"] == (
        "*.example.com."
    )
    assert create_ok(auth_client, zone, name="", type="A", values=["192.0.2.1"])["name"] == (
        "example.com."
    )
    response = post(auth_client, zone, {"name": "a.*", "type": "A", "values": ["192.0.2.1"]})
    assert response.status_code == 400
    assert "records[0].name" in error(response)["field_errors"]


# --- CNAME rules ------------------------------------------------------------------------


def test_cname_at_apex_rejected(auth_client: TestClient, zone: dict[str, Any]) -> None:
    response = post(auth_client, zone, {"name": "", "type": "CNAME", "values": ["other.com"]})
    assert response.status_code == 400
    assert error(response)["field_errors"]["records[0].name"] == (
        "RRSet of type CNAME with DNS name example.com. is not permitted at apex in zone "
        "example.com."
    )


def test_cname_single_value(auth_client: TestClient, zone: dict[str, Any]) -> None:
    response = post(auth_client, zone, {"name": "w", "type": "CNAME", "values": ["a.com", "b.com"]})
    assert response.status_code == 400
    assert "records[0].values" in error(response)["field_errors"]


def test_cname_coexistence_both_directions(auth_client: TestClient, zone: dict[str, Any]) -> None:
    create_ok(auth_client, zone, name="www", type="A", values=["192.0.2.1"])
    response = post(auth_client, zone, {"name": "www", "type": "CNAME", "values": ["x.com"]})
    assert response.status_code == 400
    assert "conflicts with other records" in error(response)["message"]

    create_ok(auth_client, zone, name="blog", type="CNAME", values=["x.com"])
    response = post(auth_client, zone, {"name": "blog", "type": "TXT", "values": ["hi"]})
    assert response.status_code == 400
    assert "CNAME" in error(response)["message"]

    # And within one batch.
    response = post(
        auth_client,
        zone,
        {"name": "shop", "type": "CNAME", "values": ["x.com"]},
        {"name": "shop", "type": "MX", "values": ["10 mx.x.com"]},
    )
    assert response.status_code == 400
    assert "records[1].name" in error(response)["field_errors"]


# --- duplicates -------------------------------------------------------------------------


def test_duplicate_409(auth_client: TestClient, zone: dict[str, Any]) -> None:
    create_ok(auth_client, zone, name="www", type="A", values=["192.0.2.1"])
    response = post(auth_client, zone, {"name": "WWW", "type": "A", "values": ["192.0.2.2"]})
    assert response.status_code == 409
    body = error(response)
    assert body["code"] == "InvalidChangeBatch"
    assert body["message"] == (
        "Tried to create resource record set [name='www.example.com.', type='A'] "
        "but it already exists"
    )


def test_duplicate_of_default_ns_409(auth_client: TestClient, zone: dict[str, Any]) -> None:
    response = post(auth_client, zone, {"name": "", "type": "NS", "values": ["ns.x.com."]})
    assert response.status_code == 409


def test_duplicate_within_batch_409(auth_client: TestClient, zone: dict[str, Any]) -> None:
    record = {"name": "dup", "type": "A", "values": ["192.0.2.1"]}
    response = post(auth_client, zone, record, record)
    assert response.status_code == 409
    assert "records[1].name" in error(response)["field_errors"]
    assert listing(auth_client, zone)["total"] == 2


# --- TTL --------------------------------------------------------------------------------


@pytest.mark.parametrize("ttl", [0, 60, 2147483647])
def test_ttl_bounds_ok(auth_client: TestClient, zone: dict[str, Any], ttl: int) -> None:
    assert (
        create_ok(auth_client, zone, name="t", type="A", values=["192.0.2.1"], ttl=ttl)["ttl"]
        == ttl
    )


@pytest.mark.parametrize("ttl", [-1, 2147483648, "abc"])
def test_ttl_bounds_rejected(auth_client: TestClient, zone: dict[str, Any], ttl: Any) -> None:
    response = post(
        auth_client, zone, {"name": "t", "type": "A", "values": ["192.0.2.1"], "ttl": ttl}
    )
    assert response.status_code == 422
    assert "records[0].ttl" in error(response)["field_errors"]


def test_ttl_defaults_to_300(auth_client: TestClient, zone: dict[str, Any]) -> None:
    response = post(auth_client, zone, {"name": "t", "type": "A", "values": ["192.0.2.1"]})
    assert response.json()["items"][0]["ttl"] == 300


def test_ttl_null_rejected_for_non_alias(auth_client: TestClient, zone: dict[str, Any]) -> None:
    response = post(
        auth_client, zone, {"name": "t", "type": "A", "values": ["192.0.2.1"], "ttl": None}
    )
    assert response.status_code == 400
    assert "records[0].ttl" in error(response)["field_errors"]


# --- alias ------------------------------------------------------------------------------


def test_alias_record(auth_client: TestClient, zone: dict[str, Any]) -> None:
    record = create_ok(
        auth_client,
        zone,
        name="cdn",
        type="A",
        is_alias=True,
        alias_target="d111111abcdef8.cloudfront.net",
        alias_target_type="CLOUDFRONT",
        evaluate_target_health=True,
        values=["192.0.2.1"],
        ttl=300,
    )
    assert record["is_alias"] is True
    assert record["ttl"] is None
    assert record["values"] == []
    assert record["alias_target"] == "d111111abcdef8.cloudfront.net."
    assert record["evaluate_target_health"] is True


def test_alias_rules(auth_client: TestClient, zone: dict[str, Any]) -> None:
    alias = {
        "is_alias": True,
        "alias_target": "x.cloudfront.net",
        "alias_target_type": "CLOUDFRONT",
    }
    response = post(auth_client, zone, {"name": "m", "type": "MX", **alias})
    assert response.status_code == 400
    assert "records[0].is_alias" in error(response)["field_errors"]

    response = post(auth_client, zone, {"name": "a", "type": "A", "is_alias": True})
    assert response.status_code == 400
    assert {"records[0].alias_target", "records[0].alias_target_type"} <= error(response)[
        "field_errors"
    ].keys()

    # Alias at the apex is allowed (unlike CNAME).
    create_ok(auth_client, zone, name="", type="A", **alias)


def test_alias_record_in_zone_target_must_exist(
    auth_client: TestClient, zone: dict[str, Any]
) -> None:
    alias = {"is_alias": True, "alias_target_type": "RECORD_IN_ZONE"}
    response = post(
        auth_client,
        zone,
        {"name": "a", "type": "A", "alias_target": "missing.example.com", **alias},
    )
    assert response.status_code == 400
    assert "No record named missing.example.com." in error(response)["message"]

    create_ok(auth_client, zone, name="origin", type="A", values=["192.0.2.1"])
    create_ok(auth_client, zone, name="a", type="A", alias_target="origin.example.com", **alias)
    # A target created in the same batch also counts.
    response = post(
        auth_client,
        zone,
        {"name": "b", "type": "AAAA", "alias_target": "c.example.com", **alias},
        {"name": "c", "type": "AAAA", "values": ["2001:db8::1"]},
    )
    assert response.status_code == 201


# --- routing policies -------------------------------------------------------------------


def test_weighted_records(auth_client: TestClient, zone: dict[str, Any]) -> None:
    base = {"name": "api", "type": "A", "routing_policy": "WEIGHTED"}
    response = post(
        auth_client,
        zone,
        {**base, "values": ["192.0.2.1"], "set_identifier": "blue", "weight": 70},
        {**base, "values": ["192.0.2.2"], "set_identifier": "green", "weight": 30},
    )
    assert response.status_code == 201
    items = response.json()["items"]
    assert [(r["set_identifier"], r["weight"]) for r in items] == [("blue", 70), ("green", 30)]


def test_routing_policy_required_fields(auth_client: TestClient, zone: dict[str, Any]) -> None:
    cases: list[tuple[dict[str, Any], str]] = [
        ({"routing_policy": "WEIGHTED", "set_identifier": "a"}, "weight"),
        ({"routing_policy": "WEIGHTED", "weight": 10}, "set_identifier"),
        ({"routing_policy": "LATENCY", "set_identifier": "a"}, "region"),
        ({"routing_policy": "LATENCY", "set_identifier": "a", "region": "mars-1"}, "region"),
        ({"routing_policy": "FAILOVER", "set_identifier": "a"}, "failover"),
        ({"routing_policy": "GEOLOCATION", "set_identifier": "a"}, "geo_location"),
        (
            {"routing_policy": "GEOLOCATION", "set_identifier": "a", "geo_location": "Mars"},
            "geo_location",
        ),
        ({"routing_policy": "MULTIVALUE"}, "set_identifier"),
    ]
    for extra, field in cases:
        response = post(
            auth_client, zone, {"name": "p", "type": "A", "values": ["192.0.2.1"], **extra}
        )
        assert response.status_code == 400, extra
        assert f"records[0].{field}" in error(response)["field_errors"], extra


def test_routing_policy_valid_variants(auth_client: TestClient, zone: dict[str, Any]) -> None:
    variants = [
        {"name": "lat", "routing_policy": "LATENCY", "set_identifier": "us", "region": "us-east-1"},
        {
            "name": "fo",
            "routing_policy": "FAILOVER",
            "set_identifier": "p",
            "failover": "PRIMARY",
            "health_check_id": "hc-1",
        },
        {
            "name": "fo",
            "routing_policy": "FAILOVER",
            "set_identifier": "s",
            "failover": "SECONDARY",
        },
        {
            "name": "geo",
            "routing_policy": "GEOLOCATION",
            "set_identifier": "eu",
            "geo_location": "eu",
        },
        {"name": "mv", "routing_policy": "MULTIVALUE", "set_identifier": "1"},
        {"name": "mv", "routing_policy": "MULTIVALUE", "set_identifier": "2"},
    ]
    records = [{"type": "A", "values": ["192.0.2.1"], **v} for v in variants]
    response = post(auth_client, zone, *records)
    assert response.status_code == 201, response.text
    geo = next(r for r in response.json()["items"] if r["name"].startswith("geo"))
    assert geo["geo_location"] == "EU"


def test_simple_policy_clears_policy_fields(auth_client: TestClient, zone: dict[str, Any]) -> None:
    record = create_ok(
        auth_client, zone, name="s", type="A", values=["192.0.2.1"], set_identifier="x", weight=5
    )
    assert record["set_identifier"] == ""
    assert record["weight"] is None


def test_mixed_routing_policies_rejected(auth_client: TestClient, zone: dict[str, Any]) -> None:
    create_ok(
        auth_client,
        zone,
        name="m",
        type="A",
        values=["192.0.2.1"],
        routing_policy="WEIGHTED",
        set_identifier="one",
        weight=1,
    )
    response = post(
        auth_client,
        zone,
        {
            "name": "m",
            "type": "A",
            "values": ["192.0.2.2"],
            "routing_policy": "LATENCY",
            "set_identifier": "two",
            "region": "us-east-1",
        },
    )
    assert response.status_code == 400
    assert "records[0].routing_policy" in error(response)["field_errors"]
    response = post(auth_client, zone, {"name": "m", "type": "A", "values": ["192.0.2.2"]})
    assert response.status_code == 400


def test_failover_only_one_primary(auth_client: TestClient, zone: dict[str, Any]) -> None:
    base = {
        "name": "f",
        "type": "A",
        "values": ["192.0.2.1"],
        "routing_policy": "FAILOVER",
        "failover": "PRIMARY",
    }
    create_ok(auth_client, zone, **base, set_identifier="a")
    response = post(auth_client, zone, {**base, "set_identifier": "b"})
    assert response.status_code == 400
    assert "records[0].failover" in error(response)["field_errors"]


def test_same_set_identifier_duplicate_409(auth_client: TestClient, zone: dict[str, Any]) -> None:
    base = {
        "name": "w",
        "type": "A",
        "values": ["192.0.2.1"],
        "routing_policy": "WEIGHTED",
        "set_identifier": "same",
        "weight": 1,
    }
    create_ok(auth_client, zone, **base)
    assert post(auth_client, zone, base).status_code == 409


# --- batch atomicity --------------------------------------------------------------------


def test_batch_atomic_one_bad_record_inserts_nothing(
    auth_client: TestClient, zone: dict[str, Any]
) -> None:
    response = post(
        auth_client,
        zone,
        {"name": "ok1", "type": "A", "values": ["192.0.2.1"]},
        {"name": "ok2", "type": "TXT", "values": ["fine"]},
        {"name": "bad", "type": "MX", "values": ["nope"]},
    )
    assert response.status_code == 400
    body = error(response)
    assert list(body["field_errors"]) == ["records[2].values[0]"]
    assert listing(auth_client, zone)["total"] == 2


def test_batch_reports_all_errors(auth_client: TestClient, zone: dict[str, Any]) -> None:
    response = post(
        auth_client,
        zone,
        {"name": "a", "type": "A", "values": ["1.1.1.1", "x"]},
        {"name": "b", "type": "AAAA", "values": ["y"]},
    )
    body = error(response)
    assert set(body["field_errors"]) == {"records[0].values[1]", "records[1].values[0]"}
    assert body["message"].endswith("(and 1 more error)")


def test_batch_size_limits(auth_client: TestClient, zone: dict[str, Any]) -> None:
    assert auth_client.post(url(zone), json={"records": []}).status_code == 422


# --- update -----------------------------------------------------------------------------


def test_update_record(auth_client: TestClient, zone: dict[str, Any]) -> None:
    record = create_ok(auth_client, zone, name="www", type="A", values=["192.0.2.1"])
    response = auth_client.put(
        url(zone, f"/{record['id']}"),
        json={"name": "web", "type": "A", "values": ["192.0.2.9", "192.0.2.10"], "ttl": 60},
    )
    assert response.status_code == 200
    updated = response.json()
    assert updated["id"] == record["id"]
    assert updated["name"] == "web.example.com."
    assert updated["values"] == ["192.0.2.9", "192.0.2.10"]
    assert updated["ttl"] == 60


def test_update_record_validation(auth_client: TestClient, zone: dict[str, Any]) -> None:
    record = create_ok(auth_client, zone, name="www", type="A", values=["192.0.2.1"])
    create_ok(auth_client, zone, name="other", type="A", values=["192.0.2.2"])
    response = auth_client.put(
        url(zone, f"/{record['id']}"), json={"name": "www", "type": "A", "values": ["bad"]}
    )
    assert response.status_code == 400
    assert "values[0]" in error(response)["field_errors"]
    # Renaming onto an existing record is a duplicate.
    response = auth_client.put(
        url(zone, f"/{record['id']}"), json={"name": "other", "type": "A", "values": ["192.0.2.1"]}
    )
    assert response.status_code == 409
    # Saving unchanged is fine (doesn't conflict with itself).
    response = auth_client.put(
        url(zone, f"/{record['id']}"), json={"name": "www", "type": "A", "values": ["192.0.2.1"]}
    )
    assert response.status_code == 200


def test_update_404(auth_client: TestClient, zone: dict[str, Any]) -> None:
    response = auth_client.put(
        url(zone, "/nope"), json={"name": "x", "type": "A", "values": ["192.0.2.1"]}
    )
    assert response.status_code == 404
    assert error(response)["code"] == "NoSuchRecord"


def test_default_records_editable_but_name_type_fixed(
    auth_client: TestClient, zone: dict[str, Any]
) -> None:
    items = listing(auth_client, zone)["items"]
    ns, soa = items
    response = auth_client.put(
        url(zone, f"/{ns['id']}"),
        json={"name": "", "type": "NS", "ttl": 3600, "values": ns["values"][:2]},
    )
    assert response.status_code == 200
    assert response.json()["values"] == ns["values"][:2]
    assert response.json()["is_default"] is True
    assert (
        auth_client.get(f"/api/hosted-zones/{zone['id']}").json()["name_servers"]
        == ns["values"][:2]
    )

    response = auth_client.put(
        url(zone, f"/{soa['id']}"),
        json={"name": "", "type": "SOA", "ttl": 60, "values": soa["values"]},
    )
    assert response.status_code == 200
    assert response.json()["ttl"] == 60

    response = auth_client.put(
        url(zone, f"/{ns['id']}"), json={"name": "sub", "type": "NS", "values": ns["values"]}
    )
    assert response.status_code == 400
    assert "name" in error(response)["field_errors"]
    response = auth_client.put(
        url(zone, f"/{soa['id']}"), json={"name": "", "type": "TXT", "values": ["x"]}
    )
    assert response.status_code == 400
    assert "type" in error(response)["field_errors"]
    response = auth_client.put(
        url(zone, f"/{soa['id']}"), json={"name": "", "type": "SOA", "values": ["garbage"]}
    )
    assert response.status_code == 400


# --- delete -----------------------------------------------------------------------------


def test_delete_record(auth_client: TestClient, zone: dict[str, Any]) -> None:
    record = create_ok(auth_client, zone, name="www", type="A", values=["192.0.2.1"])
    assert auth_client.delete(url(zone, f"/{record['id']}")).status_code == 204
    assert auth_client.get(url(zone, f"/{record['id']}")).status_code == 404
    assert auth_client.delete(url(zone, f"/{record['id']}")).status_code == 404


def test_default_soa_ns_not_deletable(auth_client: TestClient, zone: dict[str, Any]) -> None:
    ns, soa = listing(auth_client, zone)["items"]
    response = auth_client.delete(url(zone, f"/{ns['id']}"))
    assert response.status_code == 400
    assert error(response) == {
        "code": "InvalidChangeBatch",
        "message": "A HostedZone must contain at least one NS record for the zone itself.",
        "field_errors": {},
    }
    response = auth_client.delete(url(zone, f"/{soa['id']}"))
    assert response.status_code == 400
    assert error(response)["message"] == "A HostedZone must contain exactly one SOA record."
    assert listing(auth_client, zone)["total"] == 2


def test_records_of_other_zone_not_reachable(auth_client: TestClient, zone: dict[str, Any]) -> None:
    other = create_zone(auth_client, "other.com")
    record = create_ok(auth_client, other, name="www", type="A", values=["192.0.2.1"])
    assert auth_client.get(url(zone, f"/{record['id']}")).status_code == 404
    assert auth_client.delete(url(zone, f"/{record['id']}")).status_code == 404


# --- list -------------------------------------------------------------------------------


@pytest.fixture
def populated(auth_client: TestClient, zone: dict[str, Any]) -> dict[str, Any]:
    records: list[dict[str, Any]] = [
        {"name": f"host-{i:02d}", "type": "A", "values": [f"198.51.100.{i}"]} for i in range(1, 26)
    ]
    records += [
        {"name": "", "type": "MX", "values": ["10 mail.example.com"], "ttl": 3600},
        {"name": "", "type": "TXT", "values": ["v=spf1 -all"]},
        {"name": "www", "type": "CNAME", "values": ["example.com"]},
        {
            "name": "cdn",
            "type": "A",
            "is_alias": True,
            "alias_target": "abc.cloudfront.net",
            "alias_target_type": "CLOUDFRONT",
        },
        {
            "name": "api",
            "type": "A",
            "values": ["192.0.2.50"],
            "routing_policy": "WEIGHTED",
            "set_identifier": "one",
            "weight": 5,
        },
    ]
    assert post(auth_client, zone, *records).status_code == 201
    return zone


def test_list_default_order_apex_first(auth_client: TestClient, populated: dict[str, Any]) -> None:
    items = listing(auth_client, populated, page_size=100)["items"]
    assert len(items) == 32
    assert [(r["name"], r["type"]) for r in items[:4]] == [
        ("example.com.", "NS"),
        ("example.com.", "SOA"),
        ("example.com.", "MX"),
        ("example.com.", "TXT"),
    ]
    names_after_apex = [r["name"] for r in items[4:]]
    assert names_after_apex == sorted(names_after_apex)


def test_list_pagination(auth_client: TestClient, populated: dict[str, Any]) -> None:
    page1 = listing(auth_client, populated)
    assert page1["total"] == 32
    assert len(page1["items"]) == 10
    page4 = listing(auth_client, populated, page=4)
    assert len(page4["items"]) == 2
    assert listing(auth_client, populated, page=9)["items"] == []
    assert len(listing(auth_client, populated, page_size=25)["items"]) == 25


def test_list_filter_by_type(auth_client: TestClient, populated: dict[str, Any]) -> None:
    body = auth_client.get(url(populated), params=[("type", "MX"), ("type", "CNAME")]).json()
    assert body["total"] == 2
    assert {r["type"] for r in body["items"]} == {"MX", "CNAME"}
    assert listing(auth_client, populated, type="A", page_size=100)["total"] == 27
    assert auth_client.get(url(populated), params={"type": "BOGUS"}).status_code == 422


def test_list_search(auth_client: TestClient, populated: dict[str, Any]) -> None:
    assert listing(auth_client, populated, search="host-1")["total"] == 10  # host-10..19
    assert listing(auth_client, populated, search="198.51.100.25")["total"] == 1  # by value
    assert listing(auth_client, populated, search="CLOUDFRONT")["total"] == 1  # alias target
    assert listing(auth_client, populated, search="spf1")["total"] == 1
    assert listing(auth_client, populated, search="zzz")["total"] == 0


def test_list_other_filters(auth_client: TestClient, populated: dict[str, Any]) -> None:
    assert listing(auth_client, populated, alias="true")["total"] == 1
    assert listing(auth_client, populated, alias="false")["total"] == 31
    assert listing(auth_client, populated, routing_policy="WEIGHTED")["total"] == 1
    assert listing(auth_client, populated, name="www")["total"] == 1
    assert listing(auth_client, populated, value="mail.example")["total"] == 1


def test_list_sorting(auth_client: TestClient, populated: dict[str, Any]) -> None:
    by_ttl = listing(auth_client, populated, sort_by="ttl", sort_order="desc", page_size=100)[
        "items"
    ]
    assert by_ttl[0]["ttl"] == 172800
    assert by_ttl[-1]["ttl"] is None  # alias
    by_type = listing(auth_client, populated, sort_by="type", page_size=100)["items"]
    types = [r["type"] for r in by_type]
    assert types == sorted(types)
    desc = listing(auth_client, populated, sort_by="name", sort_order="desc")["items"]
    assert desc[0]["name"] == "www.example.com."
