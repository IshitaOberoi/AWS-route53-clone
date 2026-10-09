"""DNS record endpoints. Business rules live in ``app.services.record_service``."""

from typing import Annotated, Literal

from fastapi import APIRouter, Query, Response, status

from app.deps import CurrentUser, DbSession
from app.errors import errors_doc
from app.schemas.common import Page, PageSize, SortOrder
from app.schemas.record import (
    BulkDeleteIn,
    BulkDeleteOut,
    LineIssueOut,
    RecordBatchCreate,
    RecordBatchOut,
    RecordIn,
    RecordOut,
    RecordSortField,
    RecordType,
    RoutingPolicy,
    ZoneFileImport,
    ZoneFileImportOut,
)
from app.services import bind_io, record_service, zone_service
from app.services.record_service import RecordListParams

router = APIRouter(prefix="/api/hosted-zones/{zone_id}/records", tags=["records"])
zone_files = APIRouter(prefix="/api/hosted-zones/{zone_id}", tags=["records"])


@router.get(
    "",
    response_model=Page[RecordOut],
    summary="List records",
    description=(
        "Server-side search, filtering, sorting and pagination. Without `sort_by`, records "
        "are listed in canonical DNS order (zone apex first, NS and SOA first within a name), "
        "like the console. `type` and `routing_policy` may be repeated."
    ),
    responses=errors_doc(401, 404, 422),
)
def list_records(
    zone_id: str,
    user: CurrentUser,
    db: DbSession,
    page: Annotated[int, Query(ge=1)] = 1,
    page_size: Annotated[PageSize, Query()] = 10,
    sort_by: Annotated[RecordSortField | None, Query()] = None,
    sort_order: Annotated[SortOrder, Query()] = "asc",
    search: Annotated[str | None, Query(max_length=255)] = None,
    type: Annotated[list[RecordType] | None, Query()] = None,
    routing_policy: Annotated[list[RoutingPolicy] | None, Query()] = None,
    alias: Annotated[bool | None, Query()] = None,
    name: Annotated[str | None, Query(max_length=255)] = None,
    value: Annotated[str | None, Query(max_length=255)] = None,
) -> Page[RecordOut]:
    params = RecordListParams(
        page=page,
        page_size=page_size,
        sort_by=sort_by,
        sort_order=sort_order,
        search=search,
        types=tuple(type or ()),
        routing_policies=tuple(routing_policy or ()),
        alias=alias,
        name=name,
        value=value,
    )
    result = record_service.list_records(db, user, zone_id, params)
    return Page[RecordOut](
        items=[RecordOut.model_validate(r) for r in result.items],
        total=result.total,
        page=result.page,
        page_size=result.page_size,
    )


@router.post(
    "",
    response_model=RecordBatchOut,
    status_code=status.HTTP_201_CREATED,
    summary="Create records (atomic batch)",
    description="Validates every record first; if any record is invalid nothing is created. "
    "`field_errors` keys look like `records[1].values[0]`.",
    responses=errors_doc(400, 401, 404, 409, 422),
)
def create_records(
    zone_id: str, data: RecordBatchCreate, user: CurrentUser, db: DbSession
) -> RecordBatchOut:
    created = record_service.create_records(db, user, zone_id, data.records)
    return RecordBatchOut(items=[RecordOut.model_validate(r) for r in created])


@router.post(
    "/bulk-delete",
    response_model=BulkDeleteOut,
    summary="Delete several records (atomic)",
    description="Deletes all listed records in one transaction. If any id is unknown or is a "
    "default NS/SOA record, nothing is deleted.",
    responses=errors_doc(400, 401, 404, 422),
)
def bulk_delete_records(
    zone_id: str, data: BulkDeleteIn, user: CurrentUser, db: DbSession
) -> BulkDeleteOut:
    return BulkDeleteOut(deleted=record_service.bulk_delete(db, user, zone_id, data.ids))


@router.get(
    "/{record_id}",
    response_model=RecordOut,
    summary="Get record",
    responses=errors_doc(401, 404),
)
def get_record(zone_id: str, record_id: str, user: CurrentUser, db: DbSession) -> RecordOut:
    return RecordOut.model_validate(record_service.get_record(db, user, zone_id, record_id))


@router.put(
    "/{record_id}",
    response_model=RecordOut,
    summary="Replace record",
    description="Full replace with the same validation as create. Default NS/SOA records "
    "can be edited (TTL, values) but their name and type can't change.",
    responses=errors_doc(400, 401, 404, 409, 422),
)
def update_record(
    zone_id: str, record_id: str, data: RecordIn, user: CurrentUser, db: DbSession
) -> RecordOut:
    record = record_service.update_record(db, user, zone_id, record_id, data)
    return RecordOut.model_validate(record)


@router.delete(
    "/{record_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    response_class=Response,
    summary="Delete record",
    description="Default NS and SOA records can't be deleted.",
    responses=errors_doc(400, 401, 404),
)
def delete_record(zone_id: str, record_id: str, user: CurrentUser, db: DbSession) -> Response:
    record_service.delete_record(db, user, zone_id, record_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@zone_files.post(
    "/import",
    response_model=ZoneFileImportOut,
    summary="Import a BIND zone file",
    description=(
        "Parses `$ORIGIN`, `$TTL`, `@`, relative/absolute names, blank-owner continuation "
        "lines, parentheses, `;` comments, optional class and per-record TTL. Apex SOA/NS and "
        "unsupported types are reported in `skipped`. If any line is invalid the response is "
        "400 with `field_errors` keyed `line <n>` and nothing is inserted."
    ),
    responses=errors_doc(400, 401, 404, 409, 422),
)
def import_zone_file(
    zone_id: str, data: ZoneFileImport, user: CurrentUser, db: DbSession
) -> ZoneFileImportOut:
    outcome = bind_io.import_zone_file(db, user, zone_id, data.zone_file)
    return ZoneFileImportOut(
        created=outcome.created,
        skipped=[LineIssueOut(line=i.line, message=i.message) for i in outcome.skipped],
    )


@zone_files.get(
    "/export",
    response_class=Response,
    summary="Export records (JSON or BIND)",
    description="Downloads the zone as Route 53-style JSON or as a BIND zone file.",
    responses={
        200: {
            "description": "The exported file (sent as an attachment).",
            "content": {"application/json": {}, "text/plain": {}},
        },
        **errors_doc(401, 404, 422),
    },
)
def export_zone(
    zone_id: str,
    user: CurrentUser,
    db: DbSession,
    format: Annotated[Literal["json", "bind"], Query()] = "json",
) -> Response:
    zone = zone_service.get_owned_zone(db, user, zone_id)
    if format == "json":
        body, media_type = bind_io.export_json(db, user, zone_id), "application/json"
    else:
        body, media_type = bind_io.export_bind(db, user, zone_id), "text/plain; charset=utf-8"
    filename = bind_io.export_filename(zone, format)
    return Response(
        content=body,
        media_type=media_type,
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
