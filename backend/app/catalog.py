"""Mocked AWS catalog data (regions and VPCs) used by the private hosted zone form."""

from typing import TypedDict


class Region(TypedDict):
    code: str
    name: str


class Vpc(TypedDict):
    vpc_id: str
    region: str
    name: str
    cidr: str


REGIONS: list[Region] = [
    {"code": "us-east-1", "name": "US East (N. Virginia)"},
    {"code": "us-east-2", "name": "US East (Ohio)"},
    {"code": "us-west-1", "name": "US West (N. California)"},
    {"code": "us-west-2", "name": "US West (Oregon)"},
    {"code": "ap-south-1", "name": "Asia Pacific (Mumbai)"},
    {"code": "ap-southeast-1", "name": "Asia Pacific (Singapore)"},
    {"code": "ap-northeast-1", "name": "Asia Pacific (Tokyo)"},
    {"code": "eu-west-1", "name": "Europe (Ireland)"},
    {"code": "eu-central-1", "name": "Europe (Frankfurt)"},
    {"code": "sa-east-1", "name": "South America (São Paulo)"},
]

REGION_CODES: frozenset[str] = frozenset(region["code"] for region in REGIONS)


def _vpcs_for(region: str, index: int) -> list[Vpc]:
    base = f"{index:02d}"
    return [
        {
            "vpc_id": f"vpc-0a1b2c3d4e5f6{base}01",
            "region": region,
            "name": "default",
            "cidr": "172.31.0.0/16",
        },
        {
            "vpc_id": f"vpc-0f9e8d7c6b5a4{base}02",
            "region": region,
            "name": "production",
            "cidr": f"10.{index}.0.0/16",
        },
        {
            "vpc_id": f"vpc-07c3d5e9a1b2f{base}03",
            "region": region,
            "name": "staging",
            "cidr": f"10.{100 + index}.0.0/16",
        },
    ]


VPCS: list[Vpc] = [
    vpc for index, region in enumerate(REGIONS) for vpc in _vpcs_for(region["code"], index)
]

VPC_KEYS: frozenset[tuple[str, str]] = frozenset((vpc["region"], vpc["vpc_id"]) for vpc in VPCS)
