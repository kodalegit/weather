"use client";

import "leaflet/dist/leaflet.css";

import { useMutation, useQuery } from "@tanstack/react-query";
import dynamic from "next/dynamic";
import { FormEvent, useMemo, useState } from "react";
import {
  Activity,
  Bot,
  CloudRain,
  Copy,
  Crosshair,
  Database,
  Droplets,
  MessageSquare,
  Radio,
  Send,
  Thermometer,
  Wrench,
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
type ChatEvent =
  | { type: "context"; lat: number; lon: number; days: number; units: string }
  | { type: "tool_start"; tool: string; tool_call_id: string; input: Record<string, unknown> }
  | { type: "tool_end"; tool: string; tool_call_id: string; summary: string }
  | { type: "token"; delta: string }
  | { type: "done"; content: string }
  | { type: "error"; message: string };

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

async function fetchWeather(pin: Pin, ai: boolean): Promise<WeatherResponse> {
  const res = await fetch(
    `${API_BASE}/api/weather?lat=${pin.lat}&lon=${pin.lon}&days=3&ai=${ai}`,
  );
  const data = await res.json();
  if (!res.ok) throw new Error(data.detail ? JSON.stringify(data.detail) : "Weather fetch failed");
  return data;
}

async function fetchUsage(): Promise<Record<string, unknown> | null> {
  const res = await fetch(`${API_BASE}/api/usage`);
  if (!res.ok) return null;
  const data = await res.json();
  return data.data ?? data;
}

export function FieldCastApp() {
  const [pin, setPin] = useState<Pin>(starterPin);
  const [includeAi, setIncludeAi] = useState(true);
  const [question, setQuestion] = useState("Should I spray crops here tomorrow afternoon?");
  const [events, setEvents] = useState<ChatEvent[]>([]);
  const [streamedAnswer, setStreamedAnswer] = useState("");

  const weatherQuery = useQuery({
    queryKey: ["weather", pin.lat, pin.lon, includeAi],
    queryFn: () => fetchWeather(pin, includeAi),
  });
  const usageQuery = useQuery({
    queryKey: ["usage"],
    queryFn: fetchUsage,
  });

  const streamMutation = useMutation({
    mutationFn: async () => {
      setEvents([]);
      setStreamedAnswer("");
      const res = await fetch(`${API_BASE}/api/chat/stream`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: question, lat: pin.lat, lon: pin.lon, days: 3 }),
      });
      if (!res.ok || !res.body) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.detail ?? "Agent stream failed");
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const chunks = buffer.split("\n\n");
        buffer = chunks.pop() ?? "";

        for (const chunk of chunks) {
          const line = chunk
            .split("\n")
            .find((item) => item.startsWith("data: "));
          if (!line) continue;
          const event = JSON.parse(line.slice(6)) as ChatEvent;
          setEvents((current) => [...current, event]);
          if (event.type === "token") {
            setStreamedAnswer((current) => current + event.delta);
          }
          if (event.type === "done") {
            setStreamedAnswer(event.content);
          }
          if (event.type === "error") {
            throw new Error(event.message);
          }
        }
      }
    },
  });

  function askAgent(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    streamMutation.mutate();
  }

  const weather = weatherQuery.data ?? null;
  const usage = usageQuery.data;
  const loading = weatherQuery.isLoading || weatherQuery.isFetching;
  const error =
    weatherQuery.error instanceof Error
      ? weatherQuery.error.message
      : streamMutation.error instanceof Error
        ? streamMutation.error.message
        : null;

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
                  onClick={() => setPin(starterPin)}
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
                  }}
                >
                  <Bot className="h-4 w-4" />
                  AI summaries {includeAi ? "on" : "off"}
                </Button>
              </div>
            </div>
          </div>

          <WeatherMap pin={pin} onPick={setPin} />

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
              <CardTitle>Live Weather Agent</CardTitle>
            </CardHeader>
            <CardContent>
              <form className="space-y-3" onSubmit={askAgent}>
                <Input value={question} onChange={(event) => setQuestion(event.target.value)} />
                <Button disabled={streamMutation.isPending || !question.trim()} className="w-full">
                  {streamMutation.isPending ? (
                    <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />
                  ) : (
                    <Send className="h-4 w-4" />
                  )}
                  Stream agent run
                </Button>
              </form>
              <AgentStreamPanel
                events={events}
                answer={streamedAnswer}
                running={streamMutation.isPending}
              />
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

function AgentStreamPanel({
  events,
  answer,
  running,
}: {
  events: ChatEvent[];
  answer: string;
  running: boolean;
}) {
  const toolEvents = useMemo(() => buildToolEvents(events), [events]);
  const contextEvent = events.find((event) => event.type === "context");
  const errorEvent = events.find((event) => event.type === "error");

  if (!events.length && !answer && !running) {
    return (
      <div className="mt-4 rounded-lg border border-dashed border-stone-300 bg-stone-50 p-4 text-sm leading-relaxed text-stone-500">
        Ask a question and the agent will stream its WeatherAI tool call before the final answer.
      </div>
    );
  }

  return (
    <div className="mt-4 space-y-3">
      {contextEvent?.type === "context" ? (
        <div className="rounded-lg bg-[#fff4cc] p-3 font-mono text-xs text-stone-800">
          runtime context lat={contextEvent.lat.toFixed(4)} lon={contextEvent.lon.toFixed(4)} days=
          {contextEvent.days}
        </div>
      ) : null}

      {toolEvents.map((toolEvent) => (
        <details
          key={toolEvent.id}
          open={toolEvent.status === "running"}
          className="overflow-hidden rounded-lg border border-stone-200 bg-stone-50"
        >
          <summary className="flex cursor-pointer list-none items-center gap-2 px-3 py-2 text-sm font-semibold text-stone-800">
            <span
              className={cn(
                "flex h-6 w-6 items-center justify-center rounded-md",
                toolEvent.status === "running"
                  ? "bg-amber-100 text-amber-800"
                  : "bg-emerald-100 text-emerald-800",
              )}
            >
              {toolEvent.status === "running" ? (
                <span className="h-3 w-3 animate-spin rounded-full border-2 border-current border-t-transparent" />
              ) : (
                <Wrench className="h-3.5 w-3.5" />
              )}
            </span>
            <span className="flex-1">
              {toolEvent.status === "running" ? "Calling WeatherAI get_weather" : "WeatherAI tool completed"}
            </span>
          </summary>
          <div className="space-y-2 border-t border-stone-200 p-3">
            {toolEvent.input ? (
              <pre className="overflow-auto rounded-md bg-white p-2 font-mono text-xs text-stone-600">
                {JSON.stringify(toolEvent.input, null, 2)}
              </pre>
            ) : null}
            {toolEvent.summary ? (
              <p className="text-sm leading-relaxed text-stone-600">{toolEvent.summary}</p>
            ) : null}
          </div>
        </details>
      ))}

      {answer ? (
        <div className="rounded-lg bg-stone-950 p-4 text-sm leading-relaxed text-white">
          <MessageSquare className="mb-2 h-4 w-4 text-amber-300" />
          <p className="whitespace-pre-wrap">{answer}</p>
        </div>
      ) : running ? (
        <div className="rounded-lg bg-stone-950 p-4 text-sm text-stone-300">
          Waiting for the model to synthesize the WeatherAI result...
        </div>
      ) : null}

      {errorEvent?.type === "error" ? (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">
          {errorEvent.message}
        </div>
      ) : null}
    </div>
  );
}

function buildToolEvents(events: ChatEvent[]) {
  const items: Array<{
    id: string;
    tool: string;
    input?: Record<string, unknown>;
    summary?: string;
    status: "running" | "completed";
  }> = [];
  const indexByCallId = new Map<string, number>();

  events.forEach((event, index) => {
    if (event.type === "tool_start") {
      const id = event.tool_call_id || `${event.tool}-${index}`;
      indexByCallId.set(id, items.length);
      items.push({
        id,
        tool: event.tool,
        input: event.input,
        status: "running",
      });
    }

    if (event.type === "tool_end") {
      const id = event.tool_call_id || `${event.tool}-${index}`;
      const existingIndex = indexByCallId.get(id);
      if (existingIndex === undefined) {
        items.push({
          id,
          tool: event.tool,
          summary: event.summary,
          status: "completed",
        });
        return;
      }
      items[existingIndex] = {
        ...items[existingIndex],
        tool: event.tool,
        summary: event.summary,
        status: "completed",
      };
    }
  });

  return items;
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
