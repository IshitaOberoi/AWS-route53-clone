"""Hosted zones API (AGENTS.md §4.1, §5)."""

import re
from typing import Any

from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.errors import HOSTED_ZONE_NOT_EMPTY_MESSAGE
from app.models import User

from .conftest import create_zone, login, make_user

PRIVATE_VPC = {"region": "us-east-1", "vpc_id": "vpc-0a1b2c3d4e5f60001"}


def records_of(client: TestClient, zone_id: str, **params: Any) -> dict[str, Any]:
    response = client.get(f"/api/hosted-zones/{zone_id}/records", params=params)
    assert response.status_code == 200, response.text
    body: dict[str, Any] = response.json()
    return body


# --- create -----------------------------------------------------------------------------


def test_create_public_zone_creates_default_ns_and_soa(auth_client: TestClient) -> None:
    zone = create_zone(auth_client, "Example.COM.", description="Marketing site")
    assert re.fullmatch(r"Z[A-Z0-9]{20}", zone["id"])
    assert zone["name"] == "example.com."
    assert zone["type"] == "PUBLIC"
    assert zone["description"] == "Marketing site"
    assert zone["record_count"] == 2
    assert len(zone["name_servers"]) == 4
    assert zone["name_servers"][0].endswith(".com.")
    assert zone["name_servers"][3].endswith(".co.uk.")

    records = records_of(auth_client, zone["id"])["items"]
    assert [(r["type"], r["name"], r["ttl"], r["is_default"]) for r in records] == [
        ("NS", "example.com.", 172800, True),
        ("SOA", "example.com.", 900, True),
    ]
    ns, soa = records
    assert ns["values"] == zone["name_servers"]
    assert soa["values"] == [
        f"{zone['name_servers'][0]} awsdns-hostmaster.amazon.com. 1 7200 900 1209600 86400"
    ]


def test_create_zone_idna_and_duplicates_allowed(auth_client: TestClient) -> None:
    first = create_zone(auth_client, "bücher.example")
    assert first["name"] == "xn--bcher-kva.example."
    second = create_zone(auth_client, "bücher.example")
    assert second["id"] != first["id"]
    assert second["caller_reference"] != first["caller_reference"]


def test_create_zone_invalid_names(auth_client: TestClient) -> None:
    for name in ["", "-bad.com", "bad-.com", "a..com", "sp ace.com", "x" * 64 + ".com"]:
        response = auth_client.post("/api/hosted-zones", json={"name": name})
        assert response.status_code in (400, 422), name
        assert "name" in response.json()["error"]["field_errors"], name


def test_create_zone_with_tags(auth_client: TestClient) -> None:
    zone = create_zone(
        auth_client, "tags.com", tags=[{"key": "Env", "value": "prod"}, {"key": "Team"}]
    )
    assert zone["tags"] == [{"key": "Env", "value": "prod"}, {"key": "Team", "value": ""}]


def test_create_zone_rejects_bad_tags(auth_client: TestClient) -> None:
    response = auth_client.post(
        "/api/hosted-zones",
        json={"name": "t.com", "tags": [{"key": "a", "value": "1"}, {"key": "a", "value": "2"}]},
    )
    assert response.status_code == 400
    assert "tags[1].key" in response.json()["error"]["field_errors"]
    too_many = [{"key": f"k{i}", "value": ""} for i in range(51)]
    response = auth_client.post("/api/hosted-zones", json={"name": "t.com", "tags": too_many})
    assert response.status_code == 422


def test_description_max_256(auth_client: TestClient) -> None:
    response = auth_client.post(
        "/api/hosted-zones", json={"name": "d.com", "description": "x" * 257}
    )
    assert response.status_code == 422
    assert "description" in response.json()["error"]["field_errors"]
    create_zone(auth_client, "d.com", description="x" * 256)


def test_private_zone_requires_vpc(auth_client: TestClient) -> None:
    response = auth_client.post(
        "/api/hosted-zones", json={"name": "corp.internal", "type": "PRIVATE"}
    )
    assert response.status_code == 400
    body = response.json()["error"]
    assert body["code"] == "InvalidChangeBatch"
    assert body["field_errors"]["vpcs"] == (
        "A private hosted zone must be associated with at least one VPC."
    )

    zone = create_zone(auth_client, "corp.internal", type="PRIVATE", vpcs=[PRIVATE_VPC])
    assert zone["type"] == "PRIVATE"
    assert zone["vpcs"] == [PRIVATE_VPC]


def test_private_zone_unknown_vpc(auth_client: TestClient) -> None:
    response = auth_client.post(
        "/api/hosted-zones",
        json={
            "name": "corp.internal",
            "type": "PRIVATE",
            "vpcs": [{"region": "us-east-1", "vpc-id": "x", "vpc_id": "vpc-unknown"}],
        },
    )
    assert response.status_code == 400
    assert "vpcs[0].vpc_id" in response.json()["error"]["field_errors"]


def test_public_zone_rejects_vpcs(auth_client: TestClient) -> None:
    response = auth_client.post("/api/hosted-zones", json={"name": "p.com", "vpcs": [PRIVATE_VPC]})
    assert response.status_code == 400


# --- read / list ------------------------------------------------------------------------


def test_get_zone_and_404(auth_client: TestClient, zone: dict[str, Any]) -> None:
    response = auth_client.get(f"/api/hosted-zones/{zone['id']}")
    assert response.status_code == 200
    assert response.json()["id"] == zone["id"]

    response = auth_client.get("/api/hosted-zones/ZDOESNOTEXIST000000000")
    assert response.status_code == 404
    assert response.json()["error"] == {
        "code": "NoSuchHostedZone",
        "message": "No hosted zone found with ID: ZDOESNOTEXIST000000000",
        "field_errors": {},
    }


def _seed_list(client: TestClient) -> None:
    for index in range(12):
        create_zone(client, f"zone{index:02d}.com", description=f"desc {index}")
    create_zone(client, "alpha.internal", type="PRIVATE", vpcs=[PRIVATE_VPC], description="vpn")


def test_list_pagination(auth_client: TestClient) -> None:
    _seed_list(auth_client)
    page1 = auth_client.get("/api/hosted-zones").json()
    assert page1["total"] == 13
    assert page1["page"] == 1
    assert page1["page_size"] == 10
    assert len(page1["items"]) == 10
    page2 = auth_client.get("/api/hosted-zones", params={"page": 2}).json()
    assert len(page2["items"]) == 3
    ids = {z["id"] for z in page1["items"]} | {z["id"] for z in page2["items"]}
    assert len(ids) == 13
    page_25 = auth_client.get("/api/hosted-zones", params={"page_size": 25}).json()
    assert len(page_25["items"]) == 13
    assert auth_client.get("/api/hosted-zones", params={"page_size": 7}).status_code == 422
    assert auth_client.get("/api/hosted-zones", params={"page": 0}).status_code == 422


def test_list_sort(auth_client: TestClient) -> None:
    _seed_list(auth_client)
    names = [z["name"] for z in auth_client.get("/api/hosted-zones").json()["items"]]
    assert names == sorted(names)
    desc = auth_client.get(
        "/api/hosted-zones", params={"sort_by": "name", "sort_order": "desc"}
    ).json()["items"]
    assert desc[0]["name"] == "zone11.com."
    by_type = auth_client.get(
        "/api/hosted-zones", params={"sort_by": "type", "sort_order": "desc"}
    ).json()["items"]
    assert by_type[0]["type"] == "PUBLIC"
    by_type_asc = auth_client.get("/api/hosted-zones", params={"sort_by": "type"}).json()["items"]
    assert by_type_asc[0]["type"] == "PRIVATE"


def test_list_sort_by_record_count(auth_client: TestClient) -> None:
    busy = create_zone(auth_client, "busy.com")
    create_zone(auth_client, "quiet.com")
    auth_client.post(
        f"/api/hosted-zones/{busy['id']}/records",
        json={"records": [{"name": "www", "type": "A", "values": ["192.0.2.1"]}]},
    )
    items = auth_client.get(
        "/api/hosted-zones", params={"sort_by": "record_count", "sort_order": "desc"}
    ).json()["items"]
    assert items[0]["name"] == "busy.com."
    assert items[0]["record_count"] == 3


def test_list_search_and_filters(auth_client: TestClient) -> None:
    _seed_list(auth_client)

    def names(**params: Any) -> list[str]:
        body = auth_client.get("/api/hosted-zones", params={"page_size": 100, **params}).json()
        return [z["name"] for z in body["items"]]

    assert names(search="ZONE0") == [f"zone0{i}.com." for i in range(10)]
    assert names(search="vpn") == ["alpha.internal."]  # matches description
    assert names(type="PRIVATE") == ["alpha.internal."]
    assert len(names(type="PUBLIC")) == 12
    assert names(name="zone11") == ["zone11.com."]
    assert names(description="desc 1", name="zone1") == ["zone10.com.", "zone11.com."]
    some_id = auth_client.get("/api/hosted-zones").json()["items"][0]["id"]
    assert len(names(id=some_id)) == 1
    assert len(names(search=some_id.lower())) == 1
    assert names(search="%") == []
    assert names(search="nothing-matches") == []


def test_other_users_zone_is_404(client: TestClient, db: Session, demo_user: User) -> None:
    make_user(db, "other")
    login(client, "other")
    theirs = create_zone(client, "secret.com")

    login(client, "demo")
    assert client.get(f"/api/hosted-zones/{theirs['id']}").status_code == 404
    assert (
        client.patch(f"/api/hosted-zones/{theirs['id']}", json={"description": "x"}).status_code
        == 404
    )
    assert client.delete(f"/api/hosted-zones/{theirs['id']}").status_code == 404
    assert client.get(f"/api/hosted-zones/{theirs['id']}/records").status_code == 404
    assert client.get("/api/hosted-zones").json()["total"] == 0


# --- edit -------------------------------------------------------------------------------


def test_patch_description(auth_client: TestClient, zone: dict[str, Any]) -> None:
    response = auth_client.patch(f"/api/hosted-zones/{zone['id']}", json={"description": "New"})
    assert response.status_code == 200
    body = response.json()
    assert body["description"] == "New"
    assert body["name"] == zone["name"]  # immutable
    assert body["type"] == zone["type"]


def test_patch_ignores_name_and_type(auth_client: TestClient, zone: dict[str, Any]) -> None:
    response = auth_client.patch(
        f"/api/hosted-zones/{zone['id']}", json={"name": "other.com", "type": "PRIVATE"}
    )
    assert response.status_code == 200
    assert response.json()["name"] == "example.com."
    assert response.json()["type"] == "PUBLIC"


def test_patch_private_zone_vpcs(auth_client: TestClient) -> None:
    zone = create_zone(auth_client, "corp.internal", type="PRIVATE", vpcs=[PRIVATE_VPC])
    other_vpc = {"region": "ap-south-1", "vpc_id": "vpc-0f9e8d7c6b5a40402"}
    response = auth_client.patch(
        f"/api/hosted-zones/{zone['id']}", json={"vpcs": [PRIVATE_VPC, other_vpc]}
    )
    assert response.status_code == 200
    assert response.json()["vpcs"] == [PRIVATE_VPC, other_vpc]

    response = auth_client.patch(f"/api/hosted-zones/{zone['id']}", json={"vpcs": []})
    assert response.status_code == 400
    assert "vpcs" in response.json()["error"]["field_errors"]


def test_patch_public_zone_vpcs_rejected(auth_client: TestClient, zone: dict[str, Any]) -> None:
    response = auth_client.patch(f"/api/hosted-zones/{zone['id']}", json={"vpcs": [PRIVATE_VPC]})
    assert response.status_code == 400


def test_tags_replace(auth_client: TestClient) -> None:
    zone = create_zone(auth_client, "tags.com", tags=[{"key": "Old", "value": "1"}])
    response = auth_client.put(
        f"/api/hosted-zones/{zone['id']}/tags",
        json={"tags": [{"key": "Env", "value": "prod"}, {"key": "Team", "value": "web"}]},
    )
    assert response.status_code == 200
    assert response.json() == [{"key": "Env", "value": "prod"}, {"key": "Team", "value": "web"}]
    assert auth_client.get(f"/api/hosted-zones/{zone['id']}").json()["tags"] == response.json()

    cleared = auth_client.put(f"/api/hosted-zones/{zone['id']}/tags", json={"tags": []})
    assert cleared.json() == []


def test_tags_aws_prefix_rejected(auth_client: TestClient, zone: dict[str, Any]) -> None:
    response = auth_client.put(
        f"/api/hosted-zones/{zone['id']}/tags", json={"tags": [{"key": "aws:x", "value": ""}]}
    )
    assert response.status_code == 400


# --- delete -----------------------------------------------------------------------------


def test_delete_empty_zone(auth_client: TestClient, zone: dict[str, Any]) -> None:
    response = auth_client.delete(f"/api/hosted-zones/{zone['id']}")
    assert response.status_code == 204
    assert auth_client.get(f"/api/hosted-zones/{zone['id']}").status_code == 404


def test_delete_non_empty_zone_400(auth_client: TestClient, zone: dict[str, Any]) -> None:
    created = auth_client.post(
        f"/api/hosted-zones/{zone['id']}/records",
        json={"records": [{"name": "www", "type": "A", "values": ["192.0.2.1"]}]},
    )
    assert created.status_code == 201
    response = auth_client.delete(f"/api/hosted-zones/{zone['id']}")
    assert response.status_code == 400
    assert response.json()["error"] == {
        "code": "HostedZoneNotEmpty",
        "message": HOSTED_ZONE_NOT_EMPTY_MESSAGE,
        "field_errors": {},
    }
    assert HOSTED_ZONE_NOT_EMPTY_MESSAGE == (
        "The specified hosted zone contains non-required resource record sets and so cannot "
        "be deleted."
    )
    assert auth_client.get(f"/api/hosted-zones/{zone['id']}").status_code == 200


def test_delete_zone_with_edited_defaults_ok(auth_client: TestClient, zone: dict[str, Any]) -> None:
    ns = records_of(auth_client, zone["id"], type="NS")["items"][0]
    auth_client.put(
        f"/api/hosted-zones/{zone['id']}/records/{ns['id']}",
        json={"type": "NS", "ttl": 3600, "values": ns["values"]},
    )
    assert auth_client.delete(f"/api/hosted-zones/{zone['id']}").status_code == 204


# --- meta -------------------------------------------------------------------------------


def test_meta_regions_and_vpcs(auth_client: TestClient) -> None:
    regions = auth_client.get("/api/meta/regions").json()
    assert {"code": "us-east-1", "name": "US East (N. Virginia)"} in regions
    vpcs = auth_client.get("/api/meta/vpcs", params={"region": "us-east-1"}).json()
    assert vpcs
    assert all(v["region"] == "us-east-1" for v in vpcs)
    assert PRIVATE_VPC["vpc_id"] in {v["vpc_id"] for v in vpcs}
