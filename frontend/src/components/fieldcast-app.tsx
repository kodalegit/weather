"use client";

import "leaflet/dist/leaflet.css";

import dynamic from "next/dynamic";
import { FormEvent, useEffect, useMemo, useState } from "react";
import {
  Activity,
  Bot,
  CloudRain,
  Copy,
  Crosshair,
  Database,
  Droplets,
  Loader2,
  MessageSquare,
  Radio,
  Send,
  Thermometer,
  Wind,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

const WeatherMap = dynamic(() => import("@/components/weather-map"), {
  ssr: false,
  loading: () => <div className="h-full w-full animate-pulse bg-stone-200" />,
});

type Pin = { lat: number; lon: number };
type Advisory = {
  posture: "go" | "watch" | "delay";
  summary: string;
  sms_preview: string;
  risks: Array<{ level: string; label: string }>;
  signals: Record<string, number | string | null>;
};
type WeatherResponse = {
  weather: Record<string, unknown>;
  meta: Record<string, string | null>;
  advisory: Advisory;
};
type ChatResponse = {
  answer: string;
  tool_calls: Array<{ name: string; args: Record<string, unknown> }>;
};

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000";
const starterPin = { lat: -1.1468, lon: 36.961 };

function readNumber(value: unknown, names: string[]): number | null {
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = readNumber(item, names);
      if (found !== null) return found;
    }
  }
  if (value && typeof value === "object") {
    for (const [key, nested] of Object.entries(value)) {
      const normalized = key.toLowerCase().replaceAll("_", "");
      if (names.includes(normalized) && typeof nested === "number") return nested;
      const found = readNumber(nested, names);
      if (found !== null) return found;
    }
  }
  return null;
}

function readText(value: unknown, names: string[]): string | null {
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = readText(item, names);
      if (found) return found;
    }
  }
  if (value && typeof value === "object") {
    for (const [key, nested] of Object.entries(value)) {
      const normalized = key.toLowerCase().replaceAll("_", "");
      if (names.includes(normalized) && typeof nested === "string") return nested;
      const found = readText(nested, names);
      if (found) return found;
    }
  }
  return null;
}

function formatMaybe(value: number | string | null | undefined, suffix = "") {
  if (value === null || value === undefined || value === "") return "n/a";
  if (typeof value === "number") return `${Math.round(value)}${suffix}`;
  return value;
}

export function FieldCastApp() {
  const [pin, setPin] = useState<Pin>(starterPin);
  const [includeAi, setIncludeAi] = useState(true);
  const [weather, setWeather] = useState<WeatherResponse | null>(null);
  const [usage, setUsage] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [question, setQuestion] = useState("Should I spray crops here tomorrow afternoon?");
  const [chat, setChat] = useState<ChatResponse | null>(null);
  const [chatLoading, setChatLoading] = useState(false);

  async function fetchWeather(nextPin = pin, ai = includeAi) {
    setPin(nextPin);
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `${API_BASE}/api/weather?lat=${nextPin.lat}&lon=${nextPin.lon}&days=3&ai=${ai}`,
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail ? JSON.stringify(data.detail) : "Weather fetch failed");
      setWeather(data);
      setChat(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unexpected weather error");
    } finally {
      setLoading(false);
    }
  }

  async function fetchUsage() {
    try {
      const res = await fetch(`${API_BASE}/api/usage`);
      if (res.ok) {
        const data = await res.json();
        setUsage(data.data ?? data);
      }
    } catch {
      setUsage(null);
    }
  }

  async function askAgent(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setChatLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: question, lat: pin.lat, lon: pin.lon }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail ?? "Agent request failed");
      setChat(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unexpected agent error");
    } finally {
      setChatLoading(false);
    }
  }

  useEffect(() => {
    // Initial app hydration intentionally loads the default field once.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchWeather(starterPin, true);
    fetchUsage();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const signals = weather?.advisory.signals;
  const temp =
    signals?.temperature ?? readNumber(weather?.weather, ["temperature", "temperaturec", "tempc", "temp"]);
  const rain =
    signals?.rain_probability ??
    readNumber(weather?.weather, [
      "rainprobability",
      "precipitationprobability",
      "pop",
      "chanceofrain",
    ]);
  const wind =
    signals?.wind_speed ?? readNumber(weather?.weather, ["windspeed", "windkph", "windkmh", "wind"]);
  const condition =
    signals?.condition ?? readText(weather?.weather, ["condition", "summary", "description", "weather"]);
  const city = weather?.meta["x-city"] ?? readText(weather?.weather, ["city", "location", "name"]);
  const region = weather?.meta["x-region"] ?? readText(weather?.weather, ["region", "county"]);

  const quotaLabel = useMemo(() => {
    const remaining = readNumber(usage, ["remaining", "requestsremaining", "requestremaining"]);
    const limit = readNumber(usage, ["limit", "requestlimit", "requests"]);
    if (remaining === null && limit === null) return "Free plan ready";
    return `${formatMaybe(remaining)} / ${formatMaybe(limit)} left`;
  }, [usage]);

  return (
    <main className="min-h-screen bg-[#ece7dc] text-stone-950">
      <div className="grid min-h-screen grid-cols-1 xl:grid-cols-[1fr_430px]">
        <section className="relative min-h-[62vh] overflow-hidden border-b border-stone-300 xl:min-h-screen xl:border-b-0 xl:border-r">
          <div className="absolute left-5 top-5 z-[500] max-w-[calc(100%-2.5rem)]">
            <div className="rounded-lg border border-stone-950/15 bg-[#fffaf0]/95 p-4 shadow-xl backdrop-blur">
              <div className="flex flex-wrap items-center gap-2 text-xs font-bold uppercase tracking-[0.16em] text-stone-600">
                <Radio className="h-4 w-4 text-emerald-700" />
                WeatherAI FieldCast
              </div>
              <h1 className="mt-2 max-w-xl text-3xl font-black leading-none text-stone-950 md:text-5xl">
                Click a field. Get a decision.
              </h1>
              <div className="mt-4 flex flex-wrap gap-2">
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => fetchWeather(starterPin, includeAi)}
                  title="Jump to Ruiru"
                >
                  <Crosshair className="h-4 w-4" />
                  Ruiru demo
                </Button>
                <Button
                  size="sm"
                  variant={includeAi ? "default" : "secondary"}
                  onClick={() => {
                    setIncludeAi(!includeAi);
                    fetchWeather(pin, !includeAi);
                  }}
                >
                  <Bot className="h-4 w-4" />
                  AI summaries {includeAi ? "on" : "off"}
                </Button>
              </div>
            </div>
          </div>

          <WeatherMap pin={pin} onPick={(nextPin) => fetchWeather(nextPin, includeAi)} />

          <div className="absolute bottom-5 left-5 z-[500] grid max-w-[calc(100%-2.5rem)] grid-cols-2 gap-2 md:grid-cols-4">
            <Metric icon={Thermometer} label="Temp" value={formatMaybe(temp, "C")} />
            <Metric icon={Droplets} label="Rain" value={formatMaybe(rain, "%")} />
            <Metric icon={Wind} label="Wind" value={formatMaybe(wind, " km/h")} />
            <Metric icon={Activity} label="Quota" value={quotaLabel} />
          </div>
        </section>

        <aside className="flex max-h-none flex-col gap-4 overflow-y-auto bg-[#f8f4ea] p-4 xl:max-h-screen">
          {error ? (
            <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</div>
          ) : null}

          <Card className="border-stone-300 bg-white/85">
            <CardHeader>
              <CardTitle>Selected Location</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-2xl font-black">{city ?? "Pinned field"}</div>
                  <div className="text-sm text-stone-500">
                    {[region ?? "Coordinate lookup", condition].filter(Boolean).join(" / ")}
                  </div>
                </div>
                <div className="rounded-md bg-stone-950 px-2 py-1 font-mono text-xs text-white">
                  {pin.lat.toFixed(4)}, {pin.lon.toFixed(4)}
                </div>
              </div>
              <div className="rounded-lg bg-[#e8f0df] p-4">
                <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.16em] text-emerald-800">
                  <CloudRain className="h-4 w-4" />
                  Local Advisory
                </div>
                <p className="mt-2 text-lg font-bold leading-snug">
                  {loading ? "Fetching WeatherAI data..." : weather?.advisory.summary}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                {weather?.advisory.risks.map((risk) => (
                  <span
                    key={risk.label}
                    className={cn(
                      "rounded-md px-2 py-1 text-xs font-bold uppercase tracking-[0.12em]",
                      risk.level === "high"
                        ? "bg-red-100 text-red-800"
                        : risk.level === "medium"
                          ? "bg-amber-100 text-amber-800"
                          : "bg-emerald-100 text-emerald-800",
                    )}
                  >
                    {risk.label}
                  </span>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card className="border-stone-300">
            <CardHeader>
              <CardTitle>SMS Preview</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="rounded-lg border border-dashed border-stone-300 bg-stone-50 p-3 font-mono text-sm leading-relaxed">
                {weather?.advisory.sms_preview ?? "A 160-character farmer alert appears here."}
              </div>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => navigator.clipboard.writeText(weather?.advisory.sms_preview ?? "")}
                disabled={!weather}
              >
                <Copy className="h-4 w-4" />
                Copy alert
              </Button>
            </CardContent>
          </Card>

          <Card className="border-stone-300">
            <CardHeader>
              <CardTitle>Tool-Calling Agent</CardTitle>
            </CardHeader>
            <CardContent>
              <form className="space-y-3" onSubmit={askAgent}>
                <Input value={question} onChange={(event) => setQuestion(event.target.value)} />
                <Button disabled={chatLoading} className="w-full">
                  {chatLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                  Ask field agent
                </Button>
              </form>
              {chat ? (
                <div className="mt-4 space-y-3">
                  <div className="rounded-lg bg-stone-950 p-3 text-sm leading-relaxed text-white">
                    <MessageSquare className="mb-2 h-4 w-4 text-amber-300" />
                    {chat.answer}
                  </div>
                  <div className="space-y-2">
                    {chat.tool_calls.map((call) => (
                      <div key={call.name} className="rounded-md bg-stone-100 p-2 font-mono text-xs">
                        {call.name}({JSON.stringify(call.args)})
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}
            </CardContent>
          </Card>

          <Card className="border-stone-300">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Database className="h-4 w-4" />
                Raw WeatherAI Data
              </CardTitle>
            </CardHeader>
            <CardContent>
              <pre className="max-h-80 overflow-auto rounded-lg bg-[#1b1a17] p-3 text-xs leading-relaxed text-[#eee3c4]">
                {JSON.stringify(weather?.weather ?? { status: "waiting for first forecast" }, null, 2)}
              </pre>
            </CardContent>
          </Card>
        </aside>
      </div>
    </main>
  );
}

function Metric({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Thermometer;
  label: string;
  value: string;
}) {
  return (
    <div className="min-w-[136px] rounded-lg border border-stone-950/15 bg-[#fffaf0]/95 p-3 shadow-lg backdrop-blur">
      <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.16em] text-stone-500">
        <Icon className="h-4 w-4 text-emerald-700" />
        {label}
      </div>
      <div className="mt-1 truncate text-xl font-black">{value}</div>
    </div>
  );
}
