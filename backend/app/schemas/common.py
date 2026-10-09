"""Shared schema building blocks."""

from typing import Annotated, Literal

from pydantic import AfterValidator, BaseModel, ConfigDict

PAGE_SIZES: tuple[int, ...] = (10, 25, 50, 100)


def _check_page_size(value: int) -> int:
    if value not in PAGE_SIZES:
        raise ValueError("page_size must be one of 10, 25, 50, 100")
    return value


PageSize = Annotated[int, AfterValidator(_check_page_size)]
SortOrder = Literal["asc", "desc"]


class OrmModel(BaseModel):
    model_config = ConfigDict(from_attributes=True)


class Page[T](BaseModel):
    items: list[T]
    total: int
    page: int
    page_size: int


class HealthOut(BaseModel):
    status: Literal["ok"] = "ok"


class RegionOut(BaseModel):
    code: str
    name: str


class CatalogVpcOut(BaseModel):
    vpc_id: str
    region: str
    name: str
    cidr: str
