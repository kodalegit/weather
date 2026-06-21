import { readText } from "./reader";

export type Pin = { lat: number; lon: number };

export type WeatherLocation = {
  lat: number;
  lon: number;
  timezone: string;
  requested_lat?: number;
  requested_lon?: number;
  country?: string;
};

export type CurrentWeather = {
  time: string;
  temperature: number;
  wind_speed: number;
  wind_direction: number;
  condition_code: string;
  icon: string;
  icon_path?: string;
  humidity: number;
  feels_like: number;
  uv_index: number;
  wind_gust: number;
};

export type HourlyEntry = {
  time: string;
  temperature: number;
  precipitation_probability: number;
  wind_speed: number;
  condition_code: string;
  icon: string;
  icon_path?: string;
  humidity: number;
  feels_like: number;
  wind_gust: number;
  uv_index: number;
};

export type DailyEntry = {
  date: string;
  temp_min: number;
  temp_max: number;
  precipitation_sum: number;
  sunrise: string;
  sunset: string;
  condition_code: string;
  icon: string;
  icon_path?: string;
  precipitation_probability: number;
  wind_max: number;
};

export type Advisory = {
  posture: "go" | "watch" | "delay";
  summary: string;
  sms_preview: string;
  risks: Array<{ level: string; label: string }>;
  signals: Record<string, number | string | null>;
};

export type WeatherResponse = {
  weather: Record<string, unknown>;
  meta: Record<string, string | null>;
  advisory: Advisory;
};

export type ChatEvent =
  | { type: "context"; lat: number; lon: number; days: number; units: string }
  | {
      type: "tool_start";
      tool: string;
      tool_call_id: string;
      input: Record<string, unknown> | null;
    }
  | { type: "tool_end"; tool: string; tool_call_id: string; summary: string }
  | { type: "token"; delta: string }
  | { type: "done"; content: string }
  | { type: "error"; message: string };

export type ChatTurn = {
  id: string;
  question: string;
  events: ChatEvent[];
  answer: string;
  status: "running" | "done" | "error";
  error: string | null;
};

export type ParsedWeather = {
  location: WeatherLocation | null;
  current: CurrentWeather | null;
  hourly: HourlyEntry[];
  daily: DailyEntry[];
  city: string | null;
  region: string | null;
  country: string | null;
  timezone: string | null;
};

const CONDITION_LABELS: Record<string, string> = {
  "0": "Clear sky",
  "1": "Mainly clear",
  "2": "Partly cloudy",
  "3": "Overcast",
  "45": "Fog",
  "48": "Rime fog",
  "51": "Light drizzle",
  "53": "Moderate drizzle",
  "55": "Dense drizzle",
  "56": "Light freezing drizzle",
  "57": "Dense freezing drizzle",
  "61": "Slight rain",
  "63": "Moderate rain",
  "65": "Heavy rain",
  "66": "Light freezing rain",
  "67": "Heavy freezing rain",
  "71": "Slight snow",
  "73": "Moderate snow",
  "75": "Heavy snow",
  "77": "Snow grains",
  "80": "Slight showers",
  "81": "Moderate showers",
  "82": "Violent showers",
  "85": "Slight snow showers",
  "86": "Heavy snow showers",
  "95": "Thunderstorm",
  "96": "Thunderstorm, slight hail",
  "99": "Thunderstorm, heavy hail",
};

export function conditionLabel(
  code: string | number | null | undefined,
): string {
  if (code === null || code === undefined) return "Conditions unavailable";
  return CONDITION_LABELS[String(code)] ?? "Conditions unavailable";
}

export function postureLabel(posture: Advisory["posture"]): string {
  switch (posture) {
    case "go":
      return "Go";
    case "watch":
      return "Watch";
    case "delay":
      return "Delay";
    default:
      return "—";
  }
}

export function postureTone(posture: Advisory["posture"]): {
  label: string;
  dot: string;
  badge: string;
  ring: string;
  text: string;
} {
  switch (posture) {
    case "go":
      return {
        label: "Favorable",
        dot: "bg-emerald-500",
        badge: "bg-emerald-50 text-emerald-700 ring-emerald-200",
        ring: "ring-emerald-200",
        text: "text-emerald-700",
      };
    case "watch":
      return {
        label: "Caution",
        dot: "bg-amber-500",
        badge: "bg-amber-50 text-amber-700 ring-amber-200",
        ring: "ring-amber-200",
        text: "text-amber-700",
      };
    case "delay":
      return {
        label: "Hold off",
        dot: "bg-rose-500",
        badge: "bg-rose-50 text-rose-700 ring-rose-200",
        ring: "ring-rose-200",
        text: "text-rose-700",
      };
    default:
      return {
        label: "—",
        dot: "bg-stone-400",
        badge: "bg-stone-100 text-stone-600 ring-stone-200",
        ring: "ring-stone-200",
        text: "text-stone-600",
      };
  }
}

export function riskTone(level: string): string {
  if (level === "high") return "bg-rose-50 text-rose-700 ring-rose-200";
  if (level === "medium") return "bg-amber-50 text-amber-700 ring-amber-200";
  return "bg-emerald-50 text-emerald-700 ring-emerald-200";
}

export function uvCategory(uv: number | null | undefined): {
  label: string;
  tone: string;
} {
  if (uv === null || uv === undefined)
    return { label: "n/a", tone: "text-stone-400" };
  if (uv < 3) return { label: "Low", tone: "text-emerald-600" };
  if (uv < 6) return { label: "Moderate", tone: "text-amber-600" };
  if (uv < 8) return { label: "High", tone: "text-orange-600" };
  if (uv < 11) return { label: "Very high", tone: "text-rose-600" };
  return { label: "Extreme", tone: "text-rose-700" };
}

const COMPASS = [
  "N",
  "NNE",
  "NE",
  "ENE",
  "E",
  "ESE",
  "SE",
  "SSE",
  "S",
  "SSW",
  "SW",
  "WSW",
  "W",
  "WNW",
  "NW",
  "NNW",
];

export function windDirectionLabel(deg: number | null | undefined): string {
  if (deg === null || deg === undefined) return "—";
  const index = Math.round(deg / 22.5) % 16;
  return COMPASS[index] ?? "—";
}

export function humidityTone(h: number | null | undefined): string {
  if (h === null || h === undefined) return "text-stone-400";
  if (h >= 85) return "text-sky-600";
  if (h >= 60) return "text-stone-500";
  return "text-amber-600";
}

export function rainTone(p: number | null | undefined): string {
  if (p === null || p === undefined) return "text-stone-400";
  if (p >= 60) return "text-sky-700";
  if (p >= 30) return "text-sky-500";
  return "text-stone-500";
}

export function tempTone(t: number | null | undefined): string {
  if (t === null || t === undefined) return "text-stone-400";
  if (t >= 30) return "text-rose-600";
  if (t <= 8) return "text-sky-600";
  return "text-stone-700";
}

function asNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function parseLocation(raw: unknown): WeatherLocation | null {
  if (!raw || typeof raw !== "object") return null;
  const obj = raw as Record<string, unknown>;
  const lat = asNumber(obj.lat);
  const lon = asNumber(obj.lon);
  if (lat === null || lon === null) return null;
  return {
    lat,
    lon,
    timezone: asString(obj.timezone) ?? "UTC",
    requested_lat: asNumber(obj.requested_lat) ?? undefined,
    requested_lon: asNumber(obj.requested_lon) ?? undefined,
    country: asString(obj.country) ?? undefined,
  };
}

function parseCurrent(raw: unknown): CurrentWeather | null {
  if (!raw || typeof raw !== "object") return null;
  const obj = raw as Record<string, unknown>;
  const temperature = asNumber(obj.temperature);
  if (temperature === null) return null;
  return {
    time: asString(obj.time) ?? "",
    temperature,
    wind_speed: asNumber(obj.wind_speed) ?? 0,
    wind_direction: asNumber(obj.wind_direction) ?? 0,
    condition_code: String(obj.condition_code ?? ""),
    icon: asString(obj.icon) ?? "",
    icon_path: asString(obj.icon_path) ?? undefined,
    humidity: asNumber(obj.humidity) ?? 0,
    feels_like: asNumber(obj.feels_like) ?? temperature,
    uv_index: asNumber(obj.uv_index) ?? 0,
    wind_gust: asNumber(obj.wind_gust) ?? 0,
  };
}

function parseHourly(raw: unknown): HourlyEntry[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter(
      (item): item is Record<string, unknown> =>
        !!item && typeof item === "object",
    )
    .map((obj) => ({
      time: asString(obj.time) ?? "",
      temperature: asNumber(obj.temperature) ?? 0,
      precipitation_probability: asNumber(obj.precipitation_probability) ?? 0,
      wind_speed: asNumber(obj.wind_speed) ?? 0,
      condition_code: String(obj.condition_code ?? ""),
      icon: asString(obj.icon) ?? "",
      icon_path: asString(obj.icon_path) ?? undefined,
      humidity: asNumber(obj.humidity) ?? 0,
      feels_like: asNumber(obj.feels_like) ?? 0,
      wind_gust: asNumber(obj.wind_gust) ?? 0,
      uv_index: asNumber(obj.uv_index) ?? 0,
    }));
}

function parseDaily(raw: unknown): DailyEntry[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter(
      (item): item is Record<string, unknown> =>
        !!item && typeof item === "object",
    )
    .map((obj) => ({
      date: asString(obj.date) ?? "",
      temp_min: asNumber(obj.temp_min) ?? 0,
      temp_max: asNumber(obj.temp_max) ?? 0,
      precipitation_sum: asNumber(obj.precipitation_sum) ?? 0,
      sunrise: asString(obj.sunrise) ?? "",
      sunset: asString(obj.sunset) ?? "",
      condition_code: String(obj.condition_code ?? ""),
      icon: asString(obj.icon) ?? "",
      icon_path: asString(obj.icon_path) ?? undefined,
      precipitation_probability: asNumber(obj.precipitation_probability) ?? 0,
      wind_max: asNumber(obj.wind_max) ?? 0,
    }));
}

export function parseWeatherData(
  weather: Record<string, unknown> | null | undefined,
  meta: Record<string, string | null> | null | undefined,
): ParsedWeather {
  const root = weather ?? {};
  const location = parseLocation(root.location);
  const current = parseCurrent(root.current);
  const hourly = parseHourly(root.hourly);
  const daily = parseDaily(root.daily);
  const headers = meta ?? {};
  const city =
    headers["x-city"] ??
    asString(
      root.location && (root.location as Record<string, unknown>).name,
    ) ??
    readText(root, ["city", "location", "name"]);
  const region =
    headers["x-region"] ?? readText(root, ["region", "county", "state"]);
  const country = headers["x-country"] ?? readText(root, ["country"]);
  const timezone = location?.timezone ?? null;
  return { location, current, hourly, daily, city, region, country, timezone };
}

export function formatTemp(
  value: number | null | undefined,
  suffix = "°",
): string {
  if (value === null || value === undefined || !Number.isFinite(value))
    return "—";
  return `${Math.round(value)}${suffix}`;
}

export function formatNumber(
  value: number | null | undefined,
  suffix = "",
): string {
  if (value === null || value === undefined || !Number.isFinite(value))
    return "—";
  return `${Math.round(value)}${suffix}`;
}

export function formatTime(iso: string, timezone: string | null): string {
  if (!iso) return "—";
  try {
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return iso;
    return new Intl.DateTimeFormat("en-US", {
      hour: "numeric",
      minute: "2-digit",
      timeZone: timezone ?? undefined,
    }).format(date);
  } catch {
    return iso;
  }
}

export function formatHourShort(iso: string, timezone: string | null): string {
  if (!iso) return "—";
  try {
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return iso;
    return new Intl.DateTimeFormat("en-US", {
      hour: "numeric",
      timeZone: timezone ?? undefined,
    }).format(date);
  } catch {
    return iso;
  }
}

export function formatDayLabel(iso: string, timezone: string | null): string {
  if (!iso) return "—";
  try {
    const date = new Date(`${iso}T00:00`);
    if (Number.isNaN(date.getTime())) return iso;
    const today = new Date();
    const target = new Date(`${iso}T00:00`);
    const diffDays = Math.round(
      (target.setHours(0, 0, 0, 0) - today.setHours(0, 0, 0, 0)) / 86_400_000,
    );
    if (diffDays === 0) return "Today";
    if (diffDays === 1) return "Tomorrow";
    return new Intl.DateTimeFormat("en-US", {
      weekday: "short",
      timeZone: timezone ?? undefined,
    }).format(new Date(`${iso}T00:00`));
  } catch {
    return iso;
  }
}

export function formatDateShort(iso: string): string {
  if (!iso) return "";
  try {
    return new Intl.DateTimeFormat("en-US", {
      month: "short",
      day: "numeric",
    }).format(new Date(`${iso}T00:00`));
  } catch {
    return iso;
  }
}

export function isDaytime(
  iso: string,
  sunrise?: string,
  sunset?: string,
): boolean {
  if (!iso) return true;
  try {
    const now = new Date(iso).getTime();
    if (sunrise && sunset) {
      const rise = new Date(sunrise).getTime();
      const set = new Date(sunset).getTime();
      if (!Number.isNaN(rise) && !Number.isNaN(set))
        return now >= rise && now <= set;
    }
    const hour = new Date(iso).getHours();
    return hour >= 6 && hour < 18;
  } catch {
    return true;
  }
}

export function formatLocalTime(timezone: string | null): string {
  try {
    return new Intl.DateTimeFormat("en-US", {
      weekday: "short",
      hour: "numeric",
      minute: "2-digit",
      timeZone: timezone ?? undefined,
    }).format(new Date());
  } catch {
    return new Intl.DateTimeFormat("en-US", {
      weekday: "short",
      hour: "numeric",
      minute: "2-digit",
    }).format(new Date());
  }
}
