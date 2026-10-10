from datetime import date
from typing import Literal

from pydantic import Field, computed_field

from divelog_server.schemas.base import ApiModel
from divelog_server.services.markdown import render

GearCategory = Literal[
    "regulator",
    "bcd",
    "wing",
    "computer",
    "dpv",
    "light",
    "suit",
    "cylinder",
    "mask",
    "fins",
    "reel",
    "camera",
    "other",
]


class GearItemOut(ApiModel):
    id: str
    name: str
    category: str
    brand: str
    model: str
    acquired: date | None
    retired: date | None
    notes_md: str
    sort: int
    photo_url: str | None = None
    dive_count: int = 0

    @computed_field
    @property
    def notes_html(self) -> str:
        """The notes as sanitised HTML."""
        return render(self.notes_md) or ""


class GearItemIn(ApiModel):
    name: str = Field(min_length=1, max_length=120)
    category: GearCategory
    brand: str = ""
    model: str = ""
    acquired: date | None = None
    retired: date | None = None
    notes_md: str = ""
    sort: int = 0


class GearSetupOut(ApiModel):
    id: str
    slug: str
    name: str
    description_md: str
    sort: int
    items: list[GearItemOut]
    dive_count: int = 0

    @computed_field
    @property
    def description_html(self) -> str:
        """The description as sanitised HTML."""
        return render(self.description_md) or ""


class GearSetupIn(ApiModel):
    slug: str = Field(min_length=1, max_length=120)
    name: str = Field(min_length=1, max_length=120)
    description_md: str = ""
    sort: int = 0
    item_ids: list[str] = Field(default_factory=list)


class GearPage(ApiModel):
    setups: list[GearSetupOut]
    items: list[GearItemOut]
