from __future__ import annotations

from collections.abc import AsyncGenerator
from typing import Any

from fastapi import FastAPI, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse

from app.agent import chat_answer, sse_payload, stream_weather_agent
from app.config import settings
from app.schemas import ChatRequest, WeatherQuery
from app.weather_parser import advisory_from_weather
from app.weather_service import weatherai_get

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
    units: str = "metric",
    lang: str = "en",
) -> dict[str, Any]:
    query = WeatherQuery(lat=lat, lon=lon, days=days, ai=ai, units=units, lang=lang)  # type: ignore[arg-type]
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
    return await chat_answer(request)


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
