import { useMemo, useState } from "react";
import {
  Check,
  ChevronDown,
  Copy,
  Droplets,
  Gauge,
  MapPin,
  Sun,
  Sunrise,
  Sunset,
  Thermometer,
  Wind,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { WeatherIcon } from "@/components/ui/weather-icon";
import { cn } from "@/lib/utils";
import {
  conditionLabel,
  formatHourShort,
  formatNumber,
  formatTemp,
  formatTime,
  humidityTone,
  isDaytime,
  postureTone,
  rainTone,
  riskTone,
  uvCategory,
  windDirectionLabel,
  type Advisory,
  type DailyEntry,
  type HourlyEntry,
  type ParsedWeather,
} from "@/lib/weather";

/* ------------------------------------------------------------------ */
/* Location summary                                                     */
/* ------------------------------------------------------------------ */

export function LocationSummary({
  parsed,
  pin,
  loading,
}: {
  parsed: ParsedWeather;
  pin: { lat: number; lon: number };
  loading: boolean;
}) {
  const city = parsed.city ?? "Pinned location";
  const region = parsed.region;
  const country = parsed.country;
  const localTime = parsed.timezone
    ? new Intl.DateTimeFormat("en-US", {
        weekday: "short",
        hour: "numeric",
        minute: "2-digit",
        timeZone: parsed.timezone ?? undefined,
      }).format(new Date())
    : null;

  return (
    <div className="animate-fade-in">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-[0.14em] text-stone-400">
            <MapPin className="h-3 w-3" />
            Location
          </div>
          <h1 className="mt-1 truncate text-2xl font-bold tracking-tight text-stone-900">
            {loading && !parsed.current ? "Reading conditions…" : city}
          </h1>
          <div className="mt-0.5 truncate text-sm text-stone-500">
            {[region, country].filter(Boolean).join(", ") ||
              "Coordinate lookup"}
          </div>
        </div>
        <div className="shrink-0 rounded-lg border border-stone-200 bg-white/70 px-2.5 py-1.5 font-mono text-[11px] text-stone-500">
          {pin.lat.toFixed(4)}, {pin.lon.toFixed(4)}
        </div>
      </div>
      {localTime ? (
        <div className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-stone-100 px-2.5 py-1 text-xs font-medium text-stone-600">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
          Local time {localTime}
        </div>
      ) : null}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Current weather                                                      */
/* ------------------------------------------------------------------ */

type Metric = {
  icon: typeof Thermometer;
  label: string;
  value: string;
  sub?: string;
  tone?: string;
};

export function CurrentWeatherCard({
  parsed,
  loading,
  rawData,
}: {
  parsed: ParsedWeather;
  loading: boolean;
  rawData?: unknown;
}) {
  const current = parsed.current;
  const daily = parsed.daily;

  if (loading && !current) {
    return <CurrentWeatherSkeleton />;
  }

  if (!current) {
    return (
      <div className="rounded-xl border border-dashed border-stone-200 bg-white/60 p-6 pb-8 text-sm text-stone-400">
        Waiting for the first forecast…
      </div>
    );
  }

  const today = daily[0];
  const daytime = isDaytime(current.time, today?.sunrise, today?.sunset);
  const uv = uvCategory(current.uv_index);

  const metrics: Metric[] = [
    {
      icon: Thermometer,
      label: "Feels like",
      value: formatTemp(current.feels_like),
      sub: `Actual ${formatTemp(current.temperature)}`,
    },
    {
      icon: Droplets,
      label: "Humidity",
      value: formatNumber(current.humidity, "%"),
      tone: humidityTone(current.humidity),
    },
    {
      icon: Wind,
      label: "Wind",
      value: formatNumber(current.wind_speed, " km/h"),
      sub: `${windDirectionLabel(current.wind_direction)} · gusts ${formatNumber(current.wind_gust, " km/h")}`,
    },
    {
      icon: Sun,
      label: "UV index",
      value: formatNumber(current.uv_index),
      sub: uv.label,
      tone: uv.tone,
    },
  ];

  return (
    <div className="animate-fade-in rounded-xl border border-stone-200/80 bg-white shadow-sm">
      <div className="flex items-start justify-between gap-3 p-4 pb-3">
        <div>
          <div className="text-xs font-medium uppercase tracking-[0.14em] text-stone-400">
            Current weather
          </div>
          <div className="mt-1 flex items-baseline gap-2">
            <span className="text-5xl font-bold tracking-tight text-stone-900">
              {formatTemp(current.temperature)}
            </span>
            {today ? (
              <span className="text-sm text-stone-400">
                H:{formatTemp(today.temp_max)} L:{formatTemp(today.temp_min)}
              </span>
            ) : null}
          </div>
          <div className="mt-1 text-sm font-medium text-stone-600">
            {conditionLabel(current.condition_code)}
          </div>
        </div>
        <WeatherIcon
          src={current.icon || undefined}
          alt={conditionLabel(current.condition_code)}
          size={64}
          className={cn(!daytime && "opacity-95")}
        />
      </div>

      <div className="grid grid-cols-2 gap-px bg-stone-100/80 px-px pb-px sm:grid-cols-4">
        {metrics.map((metric) => (
          <div key={metric.label} className="bg-white p-3">
            <div className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-stone-400">
              <metric.icon className="h-3 w-3" />
              {metric.label}
            </div>
            <div
              className={cn(
                "mt-1 text-lg font-semibold text-stone-800",
                metric.tone,
              )}
            >
              {metric.value}
            </div>
            {metric.sub ? (
              <div className="mt-0.5 truncate text-[11px] text-stone-400">
                {metric.sub}
              </div>
            ) : null}
          </div>
        ))}
      </div>

      {today ? (
        <div className="flex items-center justify-between border-t border-stone-100 px-4 py-2.5 text-xs text-stone-500">
          <span className="inline-flex items-center gap-1.5">
            <Sunrise className="h-3.5 w-3.5 text-amber-500" />
            {formatTime(today.sunrise, parsed.timezone)}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <Gauge className="h-3.5 w-3.5 text-sky-500" />
            Rain {formatNumber(today.precipitation_probability, "%")}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <Sunset className="h-3.5 w-3.5 text-orange-500" />
            {formatTime(today.sunset, parsed.timezone)}
          </span>
        </div>
      ) : null}

      <RawDataInspector
        data={rawData}
        label="Raw WeatherAI response"
        defaultOpen={false}
      />
    </div>
  );
}

function CurrentWeatherSkeleton() {
  return (
    <div className="rounded-xl border border-stone-200/80 bg-white shadow-sm">
      <div className="flex items-start justify-between gap-3 p-4 pb-3">
        <div className="space-y-2">
          <div className="h-3 w-20 rounded shimmer" />
          <div className="h-10 w-28 rounded shimmer" />
          <div className="h-3 w-32 rounded shimmer" />
        </div>
        <div className="h-16 w-16 rounded-full shimmer" />
      </div>
      <div className="grid grid-cols-2 gap-px bg-stone-100/80 px-px pb-px sm:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="bg-white p-3">
            <div className="h-2.5 w-12 rounded shimmer" />
            <div className="mt-2 h-4 w-10 rounded shimmer" />
          </div>
        ))}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Forecast timeline                                                    */
/* ------------------------------------------------------------------ */

export function ForecastTimeline({
  parsed,
  loading,
}: {
  parsed: ParsedWeather;
  loading: boolean;
}) {
  const [view, setView] = useState<"hourly" | "daily">("hourly");
  const nowRef = parsed.current?.time
    ? new Date(parsed.current.time).getTime()
    : null;
  const hourly = useMemo(
    () =>
      parsed.hourly
        .filter(
          (h) =>
            nowRef === null || new Date(h.time).getTime() >= nowRef - 3_600_000,
        )
        .slice(0, 24),
    [parsed.hourly, nowRef],
  );
  const daily = parsed.daily;

  if (loading && !hourly.length && !daily.length) {
    return <ForecastSkeleton />;
  }

  return (
    <div className="animate-fade-in rounded-xl border border-stone-200/80 bg-white shadow-sm">
      <div className="flex items-center justify-between px-4 pt-3.5">
        <div className="text-xs font-medium uppercase tracking-[0.14em] text-stone-400">
          Forecast
        </div>
        <div className="flex rounded-lg border border-stone-200 bg-stone-50 p-0.5">
          {(["hourly", "daily"] as const).map((option) => (
            <button
              key={option}
              onClick={() => setView(option)}
              className={cn(
                "rounded-md px-2.5 py-1 text-xs font-medium capitalize transition",
                view === option
                  ? "bg-white text-stone-900 shadow-sm"
                  : "text-stone-500 hover:text-stone-700",
              )}
            >
              {option}
            </button>
          ))}
        </div>
      </div>

      {view === "hourly" ? (
        <HourlyForecast hourly={hourly} timezone={parsed.timezone} />
      ) : (
        <DailyForecast daily={daily} />
      )}
    </div>
  );
}

function HourlyForecast({
  hourly,
  timezone,
}: {
  hourly: HourlyEntry[];
  timezone: string | null;
}) {
  if (!hourly.length) {
    return (
      <div className="px-4 py-6 text-center text-sm text-stone-400">
        No hourly data available.
      </div>
    );
  }

  return (
    <div className="scroll-area mt-2 flex gap-1 overflow-x-auto px-3 pb-3">
      {hourly.map((hour, index) => (
        <div
          key={hour.time}
          className={cn(
            "flex min-w-[58px] flex-col items-center gap-1.5 rounded-lg px-2 py-2.5 text-center",
            index === 0 && "bg-stone-50",
          )}
        >
          <div className="text-[11px] font-medium text-stone-500">
            {index === 0 ? "Now" : formatHourShort(hour.time, timezone)}
          </div>
          <WeatherIcon
            src={hour.icon || undefined}
            alt={conditionLabel(hour.condition_code)}
            size={32}
          />
          <div className="text-sm font-semibold text-stone-800">
            {formatTemp(hour.temperature)}
          </div>
          <div
            className={cn(
              "flex items-center gap-0.5 text-[11px]",
              rainTone(hour.precipitation_probability),
            )}
          >
            <Droplets className="h-2.5 w-2.5" />
            {formatNumber(hour.precipitation_probability, "%")}
          </div>
        </div>
      ))}
    </div>
  );
}

function DailyForecast({ daily }: { daily: DailyEntry[] }) {
  if (!daily.length) {
    return (
      <div className="px-4 py-6 text-center text-sm text-stone-400">
        No daily data available.
      </div>
    );
  }

  return (
    <div className="mt-2 divide-y divide-stone-100 px-2 pb-2">
      {daily.map((day, index) => {
        const label =
          index === 0
            ? "Today"
            : new Intl.DateTimeFormat("en-US", { weekday: "short" }).format(
                new Date(`${day.date}T00:00`),
              );
        const range = day.temp_max - day.temp_min;
        return (
          <div key={day.date} className="flex items-center gap-3 px-2 py-2.5">
            <div className="w-16 shrink-0 text-sm font-medium text-stone-700">
              {label}
            </div>
            <WeatherIcon
              src={day.icon || undefined}
              alt={conditionLabel(day.condition_code)}
              size={30}
            />
            <div className="flex w-20 shrink-0 items-center gap-1 text-xs text-sky-600">
              <Droplets className="h-3 w-3" />
              {formatNumber(day.precipitation_probability, "%")}
            </div>
            <div className="flex flex-1 items-center justify-end gap-2">
              <span className="text-sm text-stone-400">
                {formatTemp(day.temp_min)}
              </span>
              <div className="relative h-1.5 w-20 overflow-hidden rounded-full bg-stone-100">
                <div
                  className="absolute h-full rounded-full bg-gradient-to-r from-sky-400 via-amber-300 to-rose-400"
                  style={{
                    width: `${Math.max(20, Math.min(100, range * 6))}%`,
                  }}
                />
              </div>
              <span className="text-sm font-semibold text-stone-700">
                {formatTemp(day.temp_max)}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function ForecastSkeleton() {
  return (
    <div className="rounded-xl border border-stone-200/80 bg-white shadow-sm">
      <div className="flex items-center justify-between px-4 pt-3.5">
        <div className="h-3 w-16 rounded shimmer" />
        <div className="h-6 w-24 rounded shimmer" />
      </div>
      <div className="scroll-area mt-2 flex gap-1 overflow-x-auto px-3 pb-3">
        {Array.from({ length: 8 }).map((_, i) => (
          <div
            key={i}
            className="flex min-w-[58px] flex-col items-center gap-2 px-2 py-2.5"
          >
            <div className="h-3 w-8 rounded shimmer" />
            <div className="h-8 w-8 rounded-full shimmer" />
            <div className="h-4 w-8 rounded shimmer" />
          </div>
        ))}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Advisory section                                                     */
/* ------------------------------------------------------------------ */

export function AdvisorySection({
  advisory,
  loading,
}: {
  advisory: Advisory | null;
  loading: boolean;
}) {
  const [copied, setCopied] = useState(false);

  const tone = advisory ? postureTone(advisory.posture) : postureTone("go");
  const text =
    loading && !advisory
      ? "Reading the latest forecast…"
      : (advisory?.summary ??
        "Advisory will appear here once the forecast loads.");

  async function copyAdvisory() {
    if (!advisory) return;
    try {
      await navigator.clipboard.writeText(
        advisory.sms_preview || advisory.summary,
      );
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      /* clipboard unavailable */
    }
  }

  return (
    <div className="animate-fade-in rounded-xl border border-stone-200/80 bg-white shadow-sm">
      <div className="flex items-center justify-between px-4 pt-3.5">
        <div className="flex items-center gap-2">
          <span
            className={cn(
              "h-2 w-2 rounded-full",
              tone.dot,
              loading && "animate-pulse-soft",
            )}
          />
          <div className="text-xs font-medium uppercase tracking-[0.14em] text-stone-400">
            Field advisory
          </div>
        </div>
        {advisory ? (
          <span
            className={cn(
              "rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1",
              tone.badge,
            )}
          >
            {tone.label}
          </span>
        ) : null}
      </div>

      <div className="px-4 py-3">
        <p className="text-[15px] leading-relaxed text-stone-700">{text}</p>

        {advisory?.risks.length ? (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {advisory.risks.map((risk) => (
              <span
                key={risk.label}
                className={cn(
                  "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ring-1",
                  riskTone(risk.level),
                )}
              >
                {risk.label}
              </span>
            ))}
          </div>
        ) : null}
      </div>

      <div className="flex items-center justify-between border-t border-stone-100 px-4 py-2.5">
        <div className="text-[11px] text-stone-400">
          {advisory?.sms_preview ? `${advisory.sms_preview.length} chars` : "—"}
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={copyAdvisory}
          disabled={!advisory}
          className="gap-1.5 text-stone-500 hover:text-stone-800"
        >
          {copied ? (
            <Check className="h-3.5 w-3.5 text-emerald-600" />
          ) : (
            <Copy className="h-3.5 w-3.5" />
          )}
          {copied ? "Copied" : "Copy advisory"}
        </Button>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Raw data inspector (collapsible)                                     */
/* ------------------------------------------------------------------ */

export function RawDataInspector({
  data,
  label,
  defaultOpen = false,
}: {
  data: unknown;
  label: string;
  defaultOpen?: boolean;
}) {
  return (
    <details
      className="group overflow-hidden rounded-b-xl border-t border-stone-200/80 bg-white"
      open={defaultOpen}
    >
      <summary className="flex cursor-pointer list-none items-center justify-between px-4 py-2.5 text-xs font-medium uppercase tracking-[0.14em] text-stone-400 hover:bg-stone-50">
        <span>{label}</span>
        <ChevronDown className="h-4 w-4 transition-transform group-open:rotate-180" />
      </summary>
      <div className="border-t border-stone-100">
        <pre className="scroll-area max-h-72 overflow-auto bg-stone-950 p-3 text-[11px] leading-relaxed text-stone-200">
          {JSON.stringify(data ?? { status: "waiting for data" }, null, 2)}
        </pre>
      </div>
    </details>
  );
}
