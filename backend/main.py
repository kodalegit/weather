from __future__ import annotations

import re
from typing import Any, Literal

import httpx
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    weatherai_api_key: str = Field(default="", alias="WEATHERAI_API_KEY")
    weatherai_base_url: str = Field(
        default="https://api.weather-ai.co", alias="WEATHERAI_BASE_URL"
    )
    frontend_origin: str = Field(default="http://localhost:3000", alias="FRONTEND_ORIGIN")

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")


settings = Settings()

app = FastAPI(
    title="FieldCast API",
    description="FastAPI proxy and advisory layer for WeatherAI forecast data.",
    version="0.1.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings.frontend_origin, "http://127.0.0.1:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


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


POPULAR_LOCATIONS: dict[str, tuple[float, float]] = {
    "nairobi": (-1.2921, 36.8219),
    "ruiru": (-1.1468, 36.9610),
    "bomet": (-0.7813, 35.3416),
    "kisumu": (-0.0917, 34.7680),
    "mombasa": (-4.0435, 39.6682),
    "nakuru": (-0.3031, 36.0800),
    "eldoret": (0.5143, 35.2698),
    "kampala": (0.3476, 32.5825),
}


def require_key() -> None:
    if not settings.weatherai_api_key:
        raise HTTPException(
            status_code=500,
            detail="WEATHERAI_API_KEY is not configured on the backend.",
        )


async def weatherai_get(path: str, params: dict[str, Any] | None = None) -> dict[str, Any]:
    require_key()
    url = f"{settings.weatherai_base_url.rstrip('/')}{path}"
    headers = {"Authorization": f"Bearer {settings.weatherai_api_key}"}

    async with httpx.AsyncClient(timeout=18) as client:
        try:
            response = await client.get(url, headers=headers, params=params)
        except httpx.HTTPError as exc:
            raise HTTPException(status_code=502, detail=f"WeatherAI request failed: {exc}") from exc

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
        raise HTTPException(status_code=502, detail="WeatherAI returned invalid JSON.") from exc

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


def find_number(obj: Any, keys: tuple[str, ...]) -> float | None:
    if isinstance(obj, dict):
        for key, value in obj.items():
            normalized = key.lower().replace("_", "")
            if normalized in keys and isinstance(value, (int, float)):
                return float(value)
            found = find_number(value, keys)
            if found is not None:
                return found
    if isinstance(obj, list):
        for item in obj:
            found = find_number(item, keys)
            if found is not None:
                return found
    return None


def find_text(obj: Any, keys: tuple[str, ...]) -> str | None:
    if isinstance(obj, dict):
        for key, value in obj.items():
            normalized = key.lower().replace("_", "")
            if normalized in keys and isinstance(value, str) and value.strip():
                return value.strip()
            found = find_text(value, keys)
            if found:
                return found
    if isinstance(obj, list):
        for item in obj:
            found = find_text(item, keys)
            if found:
                return found
    return None


def collect_hourly(payload: dict[str, Any]) -> list[dict[str, Any]]:
    for key in ("hourly", "hours", "forecastHourly"):
        value = payload.get(key)
        if isinstance(value, list):
            return [item for item in value if isinstance(item, dict)]

    forecast = payload.get("forecast")
    if isinstance(forecast, dict):
        for key in ("hourly", "hours"):
            value = forecast.get(key)
            if isinstance(value, list):
                return [item for item in value if isinstance(item, dict)]

    return []


def advisory_from_weather(payload: dict[str, Any], units: str = "metric") -> dict[str, Any]:
    rain_probability = find_number(
        payload,
        (
            "rainprobability",
            "precipitationprobability",
            "precipprobability",
            "pop",
            "chanceofrain",
        ),
    )
    wind_speed = find_number(payload, ("windspeed", "windkph", "windkmh", "wind"))
    temperature = find_number(payload, ("temperature", "temperaturec", "tempc", "temp"))
    condition = find_text(payload, ("condition", "summary", "description", "weather"))
    hourly = collect_hourly(payload)

    rainy_hours = 0
    windy_hours = 0
    for hour in hourly[:24]:
        hour_rain = find_number(hour, ("rainprobability", "precipitationprobability", "pop", "chanceofrain"))
        hour_wind = find_number(hour, ("windspeed", "windkph", "windkmh", "wind"))
        if hour_rain is not None and hour_rain >= 60:
            rainy_hours += 1
        if hour_wind is not None and hour_wind >= 28:
            windy_hours += 1

    risks: list[dict[str, str]] = []
    score = 0

    if rain_probability is not None:
        if rain_probability >= 75:
            score += 3
            risks.append({"level": "high", "label": "Heavy rain likely"})
        elif rain_probability >= 45:
            score += 2
            risks.append({"level": "medium", "label": "Scattered rain risk"})
        elif rain_probability >= 20:
            score += 1
            risks.append({"level": "low", "label": "Light rain possible"})

    if wind_speed is not None:
        if wind_speed >= 35:
            score += 3
            risks.append({"level": "high", "label": "Strong wind"})
        elif wind_speed >= 22:
            score += 1
            risks.append({"level": "medium", "label": "Breezy conditions"})

    if temperature is not None:
        high_heat = temperature >= (32 if units == "metric" else 90)
        cold = temperature <= (8 if units == "metric" else 46)
        if high_heat:
            score += 2
            risks.append({"level": "medium", "label": "Heat stress"})
        elif cold:
            score += 1
            risks.append({"level": "medium", "label": "Cold-sensitive crops"})

    if rainy_hours >= 4:
        score += 2
        risks.append({"level": "high", "label": f"{rainy_hours} rainy hours ahead"})
    if windy_hours >= 4:
        risks.append({"level": "medium", "label": f"{windy_hours} windy hours ahead"})

    if score >= 5:
        posture = "delay"
        summary = "High weather risk. Delay spraying, harvesting, and exposed outdoor work until a clearer window appears."
    elif score >= 3:
        posture = "watch"
        summary = "Moderate weather risk. Keep outdoor work flexible and prioritize short tasks with a quick exit plan."
    else:
        posture = "go"
        summary = "Conditions look workable. Continue with normal field plans while monitoring the latest update."

    if condition and "storm" in condition.lower():
        posture = "delay"
        summary = "Storm signals are present. Treat the next work window as unsafe until conditions improve."

    sms = summary
    if rain_probability is not None:
        sms += f" Rain risk {round(rain_probability)}%."
    if wind_speed is not None:
        sms += f" Wind {round(wind_speed)} {'km/h' if units == 'metric' else 'mph'}."
    sms = sms[:157] + "..." if len(sms) > 160 else sms

    return {
        "posture": posture,
        "summary": summary,
        "sms_preview": sms,
        "risks": risks or [{"level": "low", "label": "No major risk detected"}],
        "signals": {
            "temperature": temperature,
            "rain_probability": rain_probability,
            "wind_speed": wind_speed,
            "condition": condition,
            "rainy_hours_next_24": rainy_hours,
        },
    }


def infer_location(message: str) -> tuple[str | None, float | None, float | None]:
    lowered = message.lower()
    for name, (lat, lon) in POPULAR_LOCATIONS.items():
        if name in lowered:
            return name.title(), lat, lon

    match = re.search(r"(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)", message)
    if match:
        return "Pinned coordinates", float(match.group(1)), float(match.group(2))

    return None, None, None


@app.get("/health")
async def health() -> dict[str, Any]:
    return {"ok": True, "configured": bool(settings.weatherai_api_key)}


@app.get("/api/weather")
async def weather(
    lat: float = Query(..., ge=-90, le=90),
    lon: float = Query(..., ge=-180, le=180),
    days: int = Query(3, ge=1, le=7),
    ai: bool = True,
    units: Literal["metric", "imperial"] = "metric",
    lang: str = "en",
) -> dict[str, Any]:
    query = WeatherQuery(lat=lat, lon=lon, days=days, ai=ai, units=units, lang=lang)
    result = await weatherai_get(
        "/v1/weather",
        {
            "lat": query.lat,
            "lon": query.lon,
            "days": query.days,
            "ai": str(query.ai).lower(),
            "units": query.units,
            "lang": query.lang,
        },
    )
    advisory = advisory_from_weather(result["data"], units=query.units)
    return {"weather": result["data"], "meta": result["headers"], "advisory": advisory}


@app.get("/api/usage")
async def usage() -> dict[str, Any]:
    return await weatherai_get("/v1/usage")


@app.post("/api/chat")
async def chat(request: ChatRequest) -> dict[str, Any]:
    location_name, inferred_lat, inferred_lon = infer_location(request.message)
    lat = inferred_lat if inferred_lat is not None else request.lat
    lon = inferred_lon if inferred_lon is not None else request.lon

    if lat is None or lon is None:
        raise HTTPException(
            status_code=400,
            detail="Ask about Nairobi/Ruiru/Bomet/etc., include coordinates, or click a map pin first.",
        )

    weather_result = await weatherai_get(
        "/v1/weather",
        {
            "lat": lat,
            "lon": lon,
            "days": request.days,
            "ai": "true",
            "units": request.units,
            "lang": "en",
        },
    )
    advisory = advisory_from_weather(weather_result["data"], units=request.units)
    place = location_name or "the selected pin"
    signals = advisory["signals"]

    answer = (
        f"For {place}, my recommendation is: {advisory['summary']} "
        f"I used WeatherAI forecast signals including rain probability "
        f"{signals.get('rain_probability')}, wind {signals.get('wind_speed')}, "
        f"temperature {signals.get('temperature')}, and condition {signals.get('condition')}."
    )

    return {
        "answer": answer,
        "tool_calls": [
            {
                "name": "weatherai_weather",
                "args": {"lat": lat, "lon": lon, "days": request.days, "ai": True},
            },
            {"name": "local_field_advisory", "args": {"units": request.units}},
        ],
        "advisory": advisory,
        "weather": weather_result["data"],
    }
