"""Health check and mocked AWS catalog endpoints."""

from typing import Annotated

from fastapi import APIRouter, Query

from app.catalog import REGIONS, VPCS
from app.deps import CurrentUser
from app.errors import errors_doc
from app.schemas.common import CatalogVpcOut, HealthOut, RegionOut

router = APIRouter(prefix="/api", tags=["meta"])


@router.get("/health", response_model=HealthOut, summary="Liveness check")
def health() -> HealthOut:
    return HealthOut()


@router.get(
    "/meta/regions",
    response_model=list[RegionOut],
    summary="List AWS regions (mocked)",
    responses=errors_doc(401),
)
def list_regions(_user: CurrentUser) -> list[RegionOut]:
    return [RegionOut(**region) for region in REGIONS]


@router.get(
    "/meta/vpcs",
    response_model=list[CatalogVpcOut],
    summary="List VPCs (mocked)",
    description="VPCs that can be associated with a private hosted zone, optionally by region.",
    responses=errors_doc(401),
)
def list_vpcs(
    _user: CurrentUser,
    region: Annotated[str | None, Query(description="Region code, e.g. us-east-1")] = None,
) -> list[CatalogVpcOut]:
    return [CatalogVpcOut(**vpc) for vpc in VPCS if region is None or vpc["region"] == region]
