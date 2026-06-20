from __future__ import annotations

import json
import re
from collections.abc import AsyncGenerator
from dataclasses import dataclass
from typing import Any, Literal

import httpx
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from langchain.agents import create_agent
from langchain.tools import ToolRuntime, tool
from langchain_openai import ChatOpenAI
from pydantic import BaseModel, Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    weatherai_api_key: str = Field(default="", alias="WEATHERAI_API_KEY")
    weatherai_base_url: str = Field(
        default="https://api.weather-ai.co", alias="WEATHERAI_BASE_URL"
    )
    frontend_origin: str = Field(default="http://localhost:3000", alias="FRONTEND_ORIGIN")
    openai_api_key: str = Field(default="", alias="OPENAI_API_KEY")
    openai_chat_model: str = Field(default="gpt-4o-mini", alias="OPENAI_CHAT_MODEL")

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


@dataclass(slots=True)
class WeatherAgentContext:
    lat: float
    lon: float
    days: int
    units: Literal["metric", "imperial"]


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


def require_openai_key() -> None:
    if not settings.openai_api_key:
        raise HTTPException(
            status_code=500,
            detail="OPENAI_API_KEY is not configured on the backend.",
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


def compact_weather_payload(payload: dict[str, Any], units: str) -> dict[str, Any]:
    advisory = advisory_from_weather(payload, units=units)
    daily: list[Any] = []
    forecast = payload.get("forecast")
    if isinstance(payload.get("daily"), list):
        daily = payload["daily"][:4]
    elif isinstance(forecast, dict) and isinstance(forecast.get("daily"), list):
        daily = forecast["daily"][:4]

    return {
        "advisory": advisory,
        "current_signals": advisory["signals"],
        "location": {
            "name": find_text(payload, ("city", "location", "name")),
            "region": find_text(payload, ("region", "county", "state")),
            "country": find_text(payload, ("country",)),
        },
        "weatherai_summary": find_text(
            payload,
            ("aisummary", "summary", "narrative", "recommendation", "description"),
        ),
        "sample_hourly": collect_hourly(payload)[:8],
        "sample_daily": daily,
    }


def sse_payload(event: dict[str, Any]) -> str:
    return f"data: {json.dumps(event, default=str)}\n\n"


def extract_text(value: Any) -> str:
    if isinstance(value, str):
        return value
    if isinstance(value, list):
        parts: list[str] = []
        for item in value:
            if isinstance(item, str):
                parts.append(item)
            elif isinstance(item, dict):
                text = item.get("text")
                if isinstance(text, str):
                    parts.append(text)
        return "".join(parts)
    return ""


def build_weather_agent():
    @tool
    async def get_weather(runtime: ToolRuntime[WeatherAgentContext]) -> str:
        """Fetch WeatherAI forecast data for the selected map pin."""
        context = runtime.context
        result = await weatherai_get(
            "/v1/weather",
            {
                "lat": context.lat,
                "lon": context.lon,
                "days": context.days,
                "ai": "true",
                "units": context.units,
                "lang": "en",
            },
        )
        compact = compact_weather_payload(result["data"], units=context.units)
        return json.dumps(compact, default=str)

    require_openai_key()
    model = ChatOpenAI(
        model=settings.openai_chat_model,
        api_key=settings.openai_api_key,
        temperature=0.2,
        streaming=True,
    )
    system_prompt = (
        "You are FieldCast, a concise weather operations agent for field teams. "
        "You are given a selected map pin as runtime context. Always call `get_weather` "
        "before answering weather, farming, travel, safety, or planning questions. "
        "Ground the answer in the WeatherAI tool result. Do not invent values. "
        "If a value is unavailable, say it is unavailable. Give practical guidance, "
        "mention the most important risk signals, and keep the answer under 180 words."
    )
    return create_agent(
        model=model,
        tools=[get_weather],
        system_prompt=system_prompt,
        context_schema=WeatherAgentContext,
    )


async def stream_weather_agent(request: ChatRequest) -> AsyncGenerator[dict[str, Any], None]:
    lat = request.lat
    lon = request.lon
    location_name, inferred_lat, inferred_lon = infer_location(request.message)
    if inferred_lat is not None and inferred_lon is not None:
        lat = inferred_lat
        lon = inferred_lon

    if lat is None or lon is None:
        yield {
            "type": "error",
            "message": "Click a map pin, ask about a known city, or include coordinates.",
        }
        return

    context = WeatherAgentContext(
        lat=lat,
        lon=lon,
        days=request.days,
        units=request.units,
    )
    agent = build_weather_agent()
    final_content = ""

    messages = [
        {
            "role": "user",
            "content": (
                f"Selected coordinates: lat={lat:.5f}, lon={lon:.5f}. "
                f"Known location override: {location_name or 'none'}.\n\n"
                f"User question: {request.message}"
            ),
        }
    ]

    yield {
        "type": "context",
        "lat": lat,
        "lon": lon,
        "days": request.days,
        "units": request.units,
    }

    try:
        async for chunk in agent.astream(
            {"messages": messages},
            context=context,
            stream_mode=["messages", "updates"],
            version="v2",
        ):
            chunk_type = chunk.get("type")
            data = chunk.get("data")

            if chunk_type == "messages":
                token, metadata = data
                if metadata.get("langgraph_node") != "model":
                    continue
                token_text = getattr(token, "text", None)
                if not isinstance(token_text, str) or not token_text:
                    token_text = extract_text(getattr(token, "content", ""))
                if token_text:
                    final_content += token_text
                    yield {"type": "token", "delta": token_text}

            elif chunk_type == "updates":
                for node_name, node_data in data.items():
                    node_messages = node_data.get("messages", [])
                    if not node_messages:
                        continue
                    latest = node_messages[-1]

                    if node_name == "model":
                        tool_calls = getattr(latest, "tool_calls", None) or []
                        for tool_call in tool_calls:
                            yield {
                                "type": "tool_start",
                                "tool": tool_call.get("name", "get_weather"),
                                "tool_call_id": tool_call.get("id", ""),
                                "input": tool_call.get("args", {}),
                            }

                    elif node_name == "tools":
                        for tool_message in node_messages:
                            content = extract_text(getattr(tool_message, "content", ""))
                            summary = "WeatherAI forecast retrieved."
                            try:
                                parsed = json.loads(content)
                                signals = parsed.get("current_signals", {})
                                summary = (
                                    "WeatherAI returned forecast signals: "
                                    f"rain={signals.get('rain_probability')}, "
                                    f"wind={signals.get('wind_speed')}, "
                                    f"temp={signals.get('temperature')}."
                                )
                            except (TypeError, ValueError, AttributeError):
                                pass
                            yield {
                                "type": "tool_end",
                                "tool": getattr(tool_message, "name", "get_weather"),
                                "tool_call_id": getattr(tool_message, "tool_call_id", ""),
                                "summary": summary,
                            }
    except Exception as exc:
        yield {"type": "error", "message": str(exc)[:240]}
        return

    yield {"type": "done", "content": final_content}


@app.get("/health")
async def health() -> dict[str, Any]:
    return {
        "ok": True,
        "configured": bool(settings.weatherai_api_key),
        "agent_configured": bool(settings.openai_api_key),
    }


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


@app.post("/api/chat/stream")
async def chat_stream(request: ChatRequest) -> StreamingResponse:
    async def event_stream() -> AsyncGenerator[str, None]:
        async for event in stream_weather_agent(request):
            yield sse_payload(event)

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )
