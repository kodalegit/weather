from __future__ import annotations

from typing import Any, Literal


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


def advisory_from_weather(
    payload: dict[str, Any], units: str = "metric"
) -> dict[str, Any]:
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
        hour_rain = find_number(
            hour, ("rainprobability", "precipitationprobability", "pop", "chanceofrain")
        )
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
        summary = (
            "High weather risk. Delay spraying, harvesting, and exposed outdoor work "
            "until a clearer window appears."
        )
    elif score >= 3:
        posture = "watch"
        summary = (
            "Moderate weather risk. Keep outdoor work flexible and prioritize short "
            "tasks with a quick exit plan."
        )
    else:
        posture = "go"
        summary = (
            "Conditions look workable. Continue with normal field plans while "
            "monitoring the latest update."
        )

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
