"""BIND import/export and bulk delete (AGENTS.md §5, §10)."""

import json
from pathlib import Path
from typing import Any

from fastapi.testclient import TestClient

from app.services.bind_io import parse_zone_file

from .conftest import create_zone

SAMPLE = (Path(__file__).parent / "fixtures" / "sample.zone").read_text()


def records_url(zone: dict[str, Any], suffix: str = "") -> str:
    return f"/api/hosted-zones/{zone['id']}/records{suffix}"


def all_records(client: TestClient, zone: dict[str, Any]) -> list[dict[str, Any]]:
    response = client.get(records_url(zone), params={"page_size": 100})
    items: list[dict[str, Any]] = response.json()["items"]
    return items


def import_text(client: TestClient, zone: dict[str, Any], text: str) -> Any:
    return client.post(f"/api/hosted-zones/{zone['id']}/import", json={"zone_file": text})


# --- parser -----------------------------------------------------------------------------


def test_parse_sample_zone() -> None:
    result = parse_zone_file(SAMPLE, "example.com.")
    assert result.errors == []
    sets = {(rs.name, rs.type): rs for rs in result.record_sets}

    assert sets[("example.com.", "A")].values == ["192.0.2.1"]
    assert sets[("example.com.", "A")].ttl == 3600
    assert sets[("example.com.", "AAAA")].values == ["2001:db8::1"]  # blank owner
    mx = sets[("example.com.", "MX")]
    assert mx.values == ["10 mail.example.com.", "20 mail2.example.com."]
    assert mx.ttl == 300
    assert sets[("example.com.", "TXT")].values == [
        '"v=spf1 include:_spf.example.com ~all"',
        '"google-site-verification=abc123" "second string with spaces"',
    ]
    assert sets[("www.example.com.", "CNAME")].values == ["example.com."]
    assert sets[("www.example.com.", "CNAME")].ttl == 60
    assert sets[("mail2.example.com.", "A")].values == ["192.0.2.26"]
    api = sets[("api.example.com.", "A")]
    assert api.values == ["192.0.2.20", "192.0.2.21"]
    assert api.ttl == 3600  # 1h
    assert sets[("_sip._tcp.example.com.", "SRV")].values == ["10 60 5060 sip.example.com."]
    assert ("*.dev.example.com.", "A") in sets
    assert sets[("txt-escaped.example.com.", "TXT")].values == ['"say \\"hi\\"; not a comment"']
    assert sets[("store.shop.example.com.", "A")].values == ["198.51.100.10"]

    reasons = {issue.line: issue.message for issue in result.skipped}
    assert "SOA record at the zone apex is managed by Route 53." in reasons.values()
    assert sum("NS records at the zone apex" in m for m in reasons.values()) == 2
    assert any("Unsupported record type HINFO" in m for m in reasons.values())
    soa_line = next(line for line, m in reasons.items() if "SOA" in m)
    assert soa_line == 7  # the line where the parenthesised SOA starts


def test_parse_errors_have_line_numbers() -> None:
    text = '$TTL abc\nwww IN A\nx CH A 1.2.3.4\nother.org. IN A 192.0.2.1\nbad IN TXT "open\n(\n'
    result = parse_zone_file(text, "example.com.")
    lines = sorted(issue.line for issue in result.errors)
    assert lines == [1, 2, 3, 4, 5, 6]


# --- import endpoint --------------------------------------------------------------------


def test_import_sample_zone(auth_client: TestClient, zone: dict[str, Any]) -> None:
    response = import_text(auth_client, zone, SAMPLE)
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["created"] == 16
    assert body["errors"] == []
    assert len(body["skipped"]) == 4
    records = all_records(auth_client, zone)
    assert len(records) == 18  # + default NS and SOA
    # Default NS/SOA untouched (the file's apex NS/SOA were skipped).
    ns = next(r for r in records if r["type"] == "NS" and r["is_default"])
    assert ns["values"][0].startswith("ns-")


def test_import_invalid_value_inserts_nothing(
    auth_client: TestClient, zone: dict[str, Any]
) -> None:
    text = "$TTL 300\nok IN A 192.0.2.1\n\nbad IN A 999.1.1.1\nmx IN MX nope\n"
    response = import_text(auth_client, zone, text)
    assert response.status_code == 400
    error = response.json()["error"]
    assert error["code"] == "InvalidChangeBatch"
    assert error["field_errors"] == {
        "line 4": "Invalid IPv4 address.",
        "line 5": (
            'MX value must have the format "priority mail-server", e.g. "10 mail.example.com".'
        ),
    }
    assert error["message"].startswith("The zone file contains 2 errors. Line 4:")
    assert len(all_records(auth_client, zone)) == 2


def test_import_syntax_error_inserts_nothing(auth_client: TestClient, zone: dict[str, Any]) -> None:
    response = import_text(auth_client, zone, 'www IN A 192.0.2.1\nbroken IN TXT "oops\n')
    assert response.status_code == 400
    assert "line 2" in response.json()["error"]["field_errors"]
    assert len(all_records(auth_client, zone)) == 2


def test_import_conflict_with_existing(auth_client: TestClient, zone: dict[str, Any]) -> None:
    auth_client.post(
        records_url(zone), json={"records": [{"name": "www", "type": "A", "values": ["192.0.2.1"]}]}
    )
    response = import_text(auth_client, zone, "a IN A 192.0.2.2\nwww IN A 192.0.2.3\n")
    assert response.status_code == 400
    assert "line 2" in response.json()["error"]["field_errors"]
    assert len(all_records(auth_client, zone)) == 3


def test_import_nothing_importable(auth_client: TestClient, zone: dict[str, Any]) -> None:
    response = import_text(auth_client, zone, "; just a comment\n@ IN NS ns1.example.com.\n")
    assert response.status_code == 400


# --- export -----------------------------------------------------------------------------


def test_export_json(auth_client: TestClient, zone: dict[str, Any]) -> None:
    import_text(auth_client, zone, SAMPLE)
    auth_client.post(
        records_url(zone),
        json={
            "records": [
                {
                    "name": "cdn",
                    "type": "A",
                    "is_alias": True,
                    "alias_target": "d1.cloudfront.net",
                    "alias_target_type": "CLOUDFRONT",
                },
                {
                    "name": "w",
                    "type": "A",
                    "values": ["192.0.2.9"],
                    "routing_policy": "WEIGHTED",
                    "set_identifier": "one",
                    "weight": 10,
                },
            ]
        },
    )
    response = auth_client.get(f"/api/hosted-zones/{zone['id']}/export", params={"format": "json"})
    assert response.status_code == 200
    assert response.headers["content-type"].startswith("application/json")
    assert response.headers["content-disposition"] == 'attachment; filename="example.com.json"'
    document = json.loads(response.text)
    assert document["hostedZone"]["Id"] == f"/hostedzone/{zone['id']}"
    assert document["hostedZone"]["Name"] == "example.com."
    assert document["hostedZone"]["Config"]["PrivateZone"] is False
    by_key = {(r["Name"], r["Type"]): r for r in document["records"]}
    assert by_key[("example.com.", "MX")]["ResourceRecords"] == [
        {"Value": "10 mail.example.com."},
        {"Value": "20 mail2.example.com."},
    ]
    assert by_key[("example.com.", "MX")]["TTL"] == 300
    assert by_key[("cdn.example.com.", "A")]["AliasTarget"]["DNSName"] == "d1.cloudfront.net."
    assert "TTL" not in by_key[("cdn.example.com.", "A")]
    assert by_key[("w.example.com.", "A")]["Weight"] == 10
    assert by_key[("w.example.com.", "A")]["SetIdentifier"] == "one"
    assert document["records"][0]["Type"] == "NS"


def test_export_bind(auth_client: TestClient, zone: dict[str, Any]) -> None:
    import_text(auth_client, zone, "www IN A 192.0.2.1\n")
    auth_client.post(
        records_url(zone),
        json={
            "records": [
                {
                    "name": "cdn",
                    "type": "A",
                    "is_alias": True,
                    "alias_target": "d1.cloudfront.net",
                    "alias_target_type": "CLOUDFRONT",
                }
            ]
        },
    )
    response = auth_client.get(f"/api/hosted-zones/{zone['id']}/export", params={"format": "bind"})
    assert response.status_code == 200
    assert response.headers["content-type"].startswith("text/plain")
    assert response.headers["content-disposition"] == 'attachment; filename="example.com.zone"'
    text = response.text
    assert "$ORIGIN example.com.\n$TTL 300\n" in text
    assert any(
        line.split()[:4] == ["www.example.com.", "300", "IN", "A"] for line in text.splitlines()
    )
    assert "; ALIAS cdn.example.com. A -> d1.cloudfront.net." in text
    assert any(
        line.split()[3] == "SOA"
        for line in text.splitlines()
        if line and not line.startswith((";", "$"))
    )


def test_export_bad_format_and_404(auth_client: TestClient, zone: dict[str, Any]) -> None:
    assert (
        auth_client.get(
            f"/api/hosted-zones/{zone['id']}/export", params={"format": "xml"}
        ).status_code
        == 422
    )
    assert auth_client.get("/api/hosted-zones/ZNOPE/export").status_code == 404


def test_export_import_round_trip(auth_client: TestClient, zone: dict[str, Any]) -> None:
    assert import_text(auth_client, zone, SAMPLE).status_code == 200
    exported = auth_client.get(
        f"/api/hosted-zones/{zone['id']}/export", params={"format": "bind"}
    ).text

    fresh = create_zone(auth_client, "example.com", description="round trip target")
    response = import_text(auth_client, fresh, exported)
    assert response.status_code == 200, response.text
    assert response.json()["created"] == 16

    def key_set(z: dict[str, Any]) -> set[tuple[Any, ...]]:
        return {
            (r["name"], r["type"], r["ttl"], tuple(r["values"]))
            for r in all_records(auth_client, z)
            if not r["is_default"]
        }

    assert key_set(fresh) == key_set(zone)
    assert len(key_set(fresh)) == 16


# --- bulk delete ------------------------------------------------------------------------


def test_bulk_delete(auth_client: TestClient, zone: dict[str, Any]) -> None:
    import_text(auth_client, zone, "a IN A 192.0.2.1\nb IN A 192.0.2.2\nc IN A 192.0.2.3\n")
    records = [r for r in all_records(auth_client, zone) if not r["is_default"]]
    ids = [r["id"] for r in records[:2]]
    response = auth_client.post(records_url(zone, "/bulk-delete"), json={"ids": ids})
    assert response.status_code == 200
    assert response.json() == {"deleted": 2}
    remaining = [r for r in all_records(auth_client, zone) if not r["is_default"]]
    assert [r["id"] for r in remaining] == [records[2]["id"]]


def test_bulk_delete_with_default_is_atomic(auth_client: TestClient, zone: dict[str, Any]) -> None:
    import_text(auth_client, zone, "a IN A 192.0.2.1\nb IN A 192.0.2.2\n")
    records = all_records(auth_client, zone)
    ids = [r["id"] for r in records]  # includes default NS + SOA
    response = auth_client.post(records_url(zone, "/bulk-delete"), json={"ids": ids})
    assert response.status_code == 400
    assert response.json()["error"]["code"] == "InvalidChangeBatch"
    assert len(all_records(auth_client, zone)) == 4


def test_bulk_delete_unknown_id_is_atomic(auth_client: TestClient, zone: dict[str, Any]) -> None:
    import_text(auth_client, zone, "a IN A 192.0.2.1\n")
    record = next(r for r in all_records(auth_client, zone) if not r["is_default"])
    response = auth_client.post(
        records_url(zone, "/bulk-delete"), json={"ids": [record["id"], "nope"]}
    )
    assert response.status_code == 404
    assert len(all_records(auth_client, zone)) == 3
    assert auth_client.post(records_url(zone, "/bulk-delete"), json={"ids": []}).status_code == 422
