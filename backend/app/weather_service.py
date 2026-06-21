from __future__ import annotations

from typing import Any

import httpx
from fastapi import HTTPException

from app.config import settings


def _require_key() -> None:
    if not settings.weatherai_api_key:
        raise HTTPException(
            status_code=500,
            detail="WEATHERAI_API_KEY is not configured on the backend.",
        )


async def weatherai_get(
    path: str, params: dict[str, Any] | None = None
) -> dict[str, Any]:
    """Call the WeatherAI API and return the body plus selected rate headers."""
    _require_key()
    url = f"{settings.weatherai_base_url.rstrip('/')}{path}"
    headers = {"Authorization": f"Bearer {settings.weatherai_api_key}"}

    async with httpx.AsyncClient(timeout=18) as client:
        try:
            response = await client.get(url, headers=headers, params=params)
        except httpx.HTTPError as exc:
            raise HTTPException(
                status_code=502, detail=f"WeatherAI request failed: {exc}"
            ) from exc

    if response.status_code >= 400:
        detail: Any
        try:
            detail = response.json()
        except ValueError:
            detail = response.text
        raise HTTPException(status_code=response.status_code, detail=detail)

    try:
        payload = response.json()
    except ValueError as exc:
        raise HTTPException(
            status_code=502, detail="WeatherAI returned invalid JSON."
        ) from exc

    return {
        "data": payload,
        "headers": {
            "x-ratelimit-limit": response.headers.get("x-ratelimit-limit"),
            "x-ratelimit-remaining": response.headers.get("x-ratelimit-remaining"),
            "x-ratelimit-reset": response.headers.get("x-ratelimit-reset"),
            "x-country": response.headers.get("x-country"),
            "x-region": response.headers.get("x-region"),
            "x-city": response.headers.get("x-city"),
        },
    }
