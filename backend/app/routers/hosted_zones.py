"""Hosted zone endpoints. Business rules live in ``app.services.zone_service``."""

from typing import Annotated, Literal

from fastapi import APIRouter, Query, Response, status

from app.deps import CurrentUser, DbSession
from app.errors import errors_doc
from app.schemas.common import Page, PageSize, SortOrder
from app.schemas.hosted_zone import (
    HostedZoneCreate,
    HostedZoneOut,
    HostedZoneSummary,
    HostedZoneUpdate,
    Tag,
    TagsReplace,
    ZoneSortField,
)
from app.services import zone_service
from app.services.zone_service import ZoneListParams

router = APIRouter(prefix="/api/hosted-zones", tags=["hosted-zones"])


@router.get(
    "",
    response_model=Page[HostedZoneSummary],
    summary="List hosted zones",
    description=(
        "Server-side search, filtering, sorting and pagination. `search` matches name, "
        "description and id (case-insensitive substring)."
    ),
    responses=errors_doc(401, 422),
)
def list_hosted_zones(
    user: CurrentUser,
    db: DbSession,
    page: Annotated[int, Query(ge=1)] = 1,
    page_size: Annotated[PageSize, Query()] = 10,
    sort_by: Annotated[ZoneSortField, Query()] = "name",
    sort_order: Annotated[SortOrder, Query()] = "asc",
    search: Annotated[str | None, Query(max_length=255)] = None,
    type: Annotated[Literal["PUBLIC", "PRIVATE"] | None, Query()] = None,
    name: Annotated[str | None, Query(max_length=255)] = None,
    description: Annotated[str | None, Query(max_length=256)] = None,
    id: Annotated[str | None, Query(max_length=32)] = None,
) -> Page[HostedZoneSummary]:
    params = ZoneListParams(
        page=page,
        page_size=page_size,
        sort_by=sort_by,
        sort_order=sort_order,
        search=search,
        type=type,
        name=name,
        description=description,
        id=id,
    )
    return zone_service.list_zones(db, user, params)


@router.post(
    "",
    response_model=HostedZoneOut,
    status_code=status.HTTP_201_CREATED,
    summary="Create hosted zone",
    description="Creates the zone together with its default NS and SOA records.",
    responses=errors_doc(400, 401, 422),
)
def create_hosted_zone(data: HostedZoneCreate, user: CurrentUser, db: DbSession) -> HostedZoneOut:
    zone = zone_service.create_zone(db, user, data)
    return zone_service.to_out(db, zone)


@router.get(
    "/{zone_id}",
    response_model=HostedZoneOut,
    summary="Get hosted zone",
    responses=errors_doc(401, 404),
)
def get_hosted_zone(zone_id: str, user: CurrentUser, db: DbSession) -> HostedZoneOut:
    return zone_service.to_out(db, zone_service.get_owned_zone(db, user, zone_id))


@router.patch(
    "/{zone_id}",
    response_model=HostedZoneOut,
    summary="Edit hosted zone",
    description="Updates the description and (private zones only) VPC associations. "
    "Domain name and type are immutable, as in Route 53.",
    responses=errors_doc(400, 401, 404, 422),
)
def update_hosted_zone(
    zone_id: str, data: HostedZoneUpdate, user: CurrentUser, db: DbSession
) -> HostedZoneOut:
    zone = zone_service.update_zone(db, user, zone_id, data)
    return zone_service.to_out(db, zone)


@router.put(
    "/{zone_id}/tags",
    response_model=list[Tag],
    summary="Replace hosted zone tags",
    responses=errors_doc(400, 401, 404, 422),
)
def replace_hosted_zone_tags(
    zone_id: str, data: TagsReplace, user: CurrentUser, db: DbSession
) -> list[Tag]:
    return zone_service.replace_tags(db, user, zone_id, data.tags)


@router.delete(
    "/{zone_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    response_class=Response,
    summary="Delete hosted zone",
    description="Only allowed when the zone contains nothing but its default NS and SOA "
    "records; otherwise returns `HostedZoneNotEmpty`.",
    responses=errors_doc(400, 401, 404),
)
def delete_hosted_zone(zone_id: str, user: CurrentUser, db: DbSession) -> Response:
    zone_service.delete_zone(db, user, zone_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
