from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field


class WeatherQuery(BaseModel):
    lat: float = Field(..., ge=-90, le=90)
    lon: float = Field(..., ge=-180, le=180)
    days: int = Field(default=3, ge=1, le=7)
    ai: bool = True
    units: Literal["metric", "imperial"] = "metric"
    lang: str = "en"


class ChatRequest(BaseModel):
    message: str = Field(..., min_length=3, max_length=600)
    lat: float | None = Field(default=None, ge=-90, le=90)
    lon: float | None = Field(default=None, ge=-180, le=180)
    days: int = Field(default=3, ge=1, le=7)
    units: Literal["metric", "imperial"] = "metric"
