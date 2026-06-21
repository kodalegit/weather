from __future__ import annotations

import json
from collections.abc import AsyncGenerator
from dataclasses import dataclass
from typing import Any, Literal

from fastapi import HTTPException
from langchain.agents import create_agent
from langchain.tools import ToolRuntime, tool
from langchain_openai import ChatOpenAI

from app.config import settings
from app.locations import infer_location
from app.schemas import ChatRequest
from app.weather_parser import compact_weather_payload, extract_text
from app.weather_service import weatherai_get


@dataclass(slots=True)
class WeatherAgentContext:
    lat: float
    lon: float
    days: int
    units: Literal["metric", "imperial"]


def _require_openai_key() -> None:
    if not settings.openai_api_key:
        raise HTTPException(
            status_code=500,
            detail="OPENAI_API_KEY is not configured on the backend.",
        )


def _build_weather_agent():
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

    _require_openai_key()
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


def _sse_payload(event: dict[str, Any]) -> str:
    return f"data: {json.dumps(event, default=str)}\n\n"


async def stream_weather_agent(
    request: ChatRequest,
) -> AsyncGenerator[dict[str, Any], None]:
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
    agent = _build_weather_agent()
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
                            args = tool_call.get("args", {}) or {}
                            # The get_weather tool reads everything from runtime
                            # context, so the LLM sends no args. Surface the
                            # context the tool will actually use so the UI can
                            # show meaningful "tool input".
                            if not args:
                                args = {
                                    "lat": context.lat,
                                    "lon": context.lon,
                                    "days": context.days,
                                    "units": context.units,
                                }
                            yield {
                                "type": "tool_start",
                                "tool": tool_call.get("name", "get_weather"),
                                "tool_call_id": tool_call.get("id", ""),
                                "input": args,
                            }

                    elif node_name == "tools":
                        for tool_message in node_messages:
                            content = extract_text(
                                getattr(tool_message, "content", "")
                            )
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
                                "tool_call_id": getattr(
                                    tool_message, "tool_call_id", ""
                                ),
                                "summary": summary,
                            }
    except Exception as exc:
        yield {"type": "error", "message": str(exc)[:240]}
        return

    yield {"type": "done", "content": final_content}


async def chat_answer(request: ChatRequest) -> dict[str, Any]:
    location_name, inferred_lat, inferred_lon = infer_location(request.message)
    lat = inferred_lat if inferred_lat is not None else request.lat
    lon = inferred_lon if inferred_lon is not None else request.lon

    if lat is None or lon is None:
        raise HTTPException(
            status_code=400,
            detail="Ask about Nairobi/Ruiru/Bomet/etc., include coordinates, or click a map pin first.",
        )

    from app.weather_parser import advisory_from_weather

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


def sse_payload(event: dict[str, Any]) -> str:
    """Public helper for formatting a single SSE event."""
    return _sse_payload(event)
