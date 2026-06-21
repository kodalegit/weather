"use client";

import "leaflet/dist/leaflet.css";

import { useMutation, useQuery } from "@tanstack/react-query";
import dynamic from "next/dynamic";
import { useMemo, useState } from "react";
import {
  Crosshair,
  Droplets,
  Gauge,
  Sparkles,
  Thermometer,
  Wind,
  X,
} from "lucide-react";

import { AgentPanel } from "@/components/agent-panel";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  AdvisorySection,
  CurrentWeatherCard,
  ForecastTimeline,
  LocationSummary,
} from "@/components/weather-panels";
import { formatMaybe, readNumber } from "@/lib/reader";
import {
  parseWeatherData,
  type Advisory,
  type ChatEvent,
  type ChatTurn,
  type Pin,
  type WeatherResponse,
} from "@/lib/weather";

const WeatherMap = dynamic(() => import("@/components/weather-map"), {
  ssr: false,
  loading: () => <div className="h-full w-full animate-pulse bg-stone-200" />,
});

const API_BASE =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000";
const starterPin: Pin = { lat: -1.2921, lon: 36.8219 };

async function fetchWeather(pin: Pin, ai: boolean): Promise<WeatherResponse> {
  const res = await fetch(
    `${API_BASE}/api/weather?lat=${pin.lat}&lon=${pin.lon}&days=3&ai=${ai}`,
  );
  const data = await res.json();
  if (!res.ok)
    throw new Error(
      data.detail ? JSON.stringify(data.detail) : "Weather fetch failed",
    );
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
  const [includeAi] = useState(true);
  const [question, setQuestion] = useState(
    "Should I spray crops here tomorrow afternoon?",
  );
  const [turns, setTurns] = useState<ChatTurn[]>([]);
  const [activeTurnId, setActiveTurnId] = useState<string | null>(null);
  const [agentOpen, setAgentOpen] = useState(false);

  const weatherQuery = useQuery({
    queryKey: ["weather", pin.lat, pin.lon, includeAi],
    queryFn: () => fetchWeather(pin, includeAi),
  });
  const usageQuery = useQuery({
    queryKey: ["usage"],
    queryFn: fetchUsage,
  });

  const streamMutation = useMutation({
    mutationFn: async (message: string) => {
      const turnId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const newTurn: ChatTurn = {
        id: turnId,
        question: message,
        events: [],
        answer: "",
        status: "running",
        error: null,
      };
      setTurns((current) => [...current, newTurn]);
      setActiveTurnId(turnId);

      const patchTurn = (patch: Partial<ChatTurn>) =>
        setTurns((current) =>
          current.map((turn) =>
            turn.id === turnId ? { ...turn, ...patch } : turn,
          ),
        );

      const res = await fetch(`${API_BASE}/api/chat/stream`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message,
          lat: pin.lat,
          lon: pin.lon,
          days: 3,
        }),
      });
      if (!res.ok || !res.body) {
        const data = await res.json().catch(() => null);
        const detail = data?.detail;
        const errorMessage = detail
          ? typeof detail === "string"
            ? detail
            : JSON.stringify(detail)
          : "Agent stream failed";
        patchTurn({ status: "error", error: errorMessage });
        throw new Error(errorMessage);
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      try {
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

            setTurns((current) =>
              current.map((turn) =>
                turn.id === turnId
                  ? { ...turn, events: [...turn.events, event] }
                  : turn,
              ),
            );

            if (event.type === "token") {
              setTurns((current) =>
                current.map((turn) =>
                  turn.id === turnId
                    ? { ...turn, answer: turn.answer + event.delta }
                    : turn,
                ),
              );
            }
            if (event.type === "done") {
              setTurns((current) =>
                current.map((turn) =>
                  turn.id === turnId
                    ? {
                        ...turn,
                        answer: event.content,
                        status: "done",
                      }
                    : turn,
                ),
              );
            }
            if (event.type === "error") {
              setTurns((current) =>
                current.map((turn) =>
                  turn.id === turnId
                    ? {
                        ...turn,
                        status: "error",
                        error: event.message,
                      }
                    : turn,
                ),
              );
              throw new Error(event.message);
            }
          }
        }
      } catch (error) {
        setTurns((current) =>
          current.map((turn) =>
            turn.id === turnId
              ? {
                  ...turn,
                  status: "error",
                  error:
                    error instanceof Error
                      ? error.message
                      : "Agent stream failed",
                }
              : turn,
          ),
        );
        throw error;
      }
    },
  });

  const weather = weatherQuery.data ?? null;
  const usage = usageQuery.data;
  const loading = weatherQuery.isLoading || weatherQuery.isFetching;
  const error =
    weatherQuery.error instanceof Error ? weatherQuery.error.message : null;

  const parsed = useMemo(
    () => parseWeatherData(weather?.weather ?? null, weather?.meta ?? null),
    [weather],
  );

  const advisory: Advisory | null = weather?.advisory ?? null;

  const quotaLabel = useMemo(() => {
    const remaining = readNumber(usage, [
      "remaining",
      "requestsremaining",
      "requestremaining",
    ]);
    const limit = readNumber(usage, ["limit", "requestlimit", "requests"]);
    if (remaining === null && limit === null) return "Free plan";
    return `${formatMaybe(remaining)} / ${formatMaybe(limit)} calls`;
  }, [usage]);

  return (
    <main className="min-h-screen bg-[#f5f3ee] text-stone-900">
      <div className="grid min-h-screen grid-cols-1 lg:grid-cols-[1fr_minmax(380px,420px)]">
        {/* ---------------------------------------------------------- */}
        {/* Left panel: interactive map                                */}
        {/* ---------------------------------------------------------- */}
        <section className="relative min-h-[58vh] overflow-hidden border-b border-stone-200 lg:min-h-screen lg:border-b-0 lg:border-r">
          <WeatherMap pin={pin} onPick={setPin} />

          {/* Top floating controls */}
          <div className="pointer-events-none absolute inset-x-0 top-0 z-[500] p-4">
            <div className="pointer-events-auto mx-auto flex max-w-2xl items-center justify-between gap-3">
              <div className="rounded-xl border border-stone-200/80 bg-white/90 px-3 py-1.5 shadow-lg backdrop-blur">
                <div className="text-sm font-semibold text-stone-800">
                  FieldCast
                </div>
                <div className="text-[11px] text-stone-400">
                  Drop a pin or ask the agent
                </div>
              </div>
              <Dialog
                open={agentOpen}
                onOpenChange={(open) => {
                  setAgentOpen(open);
                  if (open) {
                    setTurns([]);
                    setActiveTurnId(null);
                  }
                }}
              >
                <DialogTrigger asChild>
                  <Button
                    size="sm"
                    className="group shrink-0 gap-1.5 border-amber-400/50 bg-white text-stone-800 shadow-lg transition hover:border-amber-400 hover:bg-amber-50 hover:text-amber-700"
                    title="Open weather agent"
                  >
                    <Sparkles className="h-4 w-4 text-amber-500 transition group-hover:text-amber-600" />
                    Agent
                  </Button>
                </DialogTrigger>
                <DialogContent className="h-[calc(100vh-2rem)] max-h-[720px] overflow-hidden p-0 sm:h-[80vh] sm:max-h-[720px]">
                  <div className="flex h-full flex-col">
                    <div className="flex items-center justify-between border-b border-stone-100 px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-stone-900 text-white">
                          <Sparkles className="h-3.5 w-3.5" />
                        </div>
                        <div>
                          <div className="text-sm font-semibold text-stone-800">
                            Weather agent
                          </div>
                          <div className="text-[11px] text-stone-400">
                            Grounded in live WeatherAI data
                          </div>
                        </div>
                      </div>
                      <DialogClose asChild>
                        <Button variant="ghost" size="icon" className="h-8 w-8">
                          <X className="h-4 w-4" />
                        </Button>
                      </DialogClose>
                    </div>
                    <div className="flex min-h-0 flex-1 flex-col overflow-hidden p-4">
                      <AgentPanel
                        question={question}
                        onQuestionChange={setQuestion}
                        turns={turns}
                        activeTurnId={activeTurnId}
                        running={streamMutation.isPending}
                        onAsk={(message) => streamMutation.mutate(message)}
                        pin={pin}
                        inDialog
                      />
                    </div>
                  </div>
                </DialogContent>
              </Dialog>
            </div>
          </div>

          {/* Bottom floating metrics */}
          <div className="absolute bottom-4 left-4 z-[500] flex max-w-[calc(100%-2rem)] flex-wrap gap-2">
            <FloatingMetric
              icon={Thermometer}
              label="Temp"
              value={formatMaybe(parsed.current?.temperature, "°")}
            />
            <FloatingMetric
              icon={Droplets}
              label="Rain"
              value={formatMaybe(
                parsed.daily[0]?.precipitation_probability,
                "%",
              )}
            />
            <FloatingMetric
              icon={Wind}
              label="Wind"
              value={formatMaybe(parsed.current?.wind_speed, " km/h")}
            />
            <FloatingMetric icon={Gauge} label="Quota" value={quotaLabel} />
          </div>

          {/* Reset pin control */}
          <div className="absolute right-4 top-20 z-[500]">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setPin(starterPin)}
              title="Jump to Ruiru demo"
              className="shadow-lg backdrop-blur"
            >
              <Crosshair className="h-3.5 w-3.5" />
              Demo pin
            </Button>
          </div>

          {/* Map helper hint */}
          <div className="pointer-events-none absolute bottom-4 right-4 z-[500]">
            <div className="rounded-lg border border-stone-200/80 bg-white/90 px-2.5 py-1.5 text-[11px] text-stone-500 shadow-lg backdrop-blur">
              Click to drop a pin · double-click to zoom
            </div>
          </div>
        </section>

        {/* ---------------------------------------------------------- */}
        {/* Right panel: weather intelligence                          */}
        {/* ---------------------------------------------------------- */}
        <aside className="scroll-area flex h-auto min-h-0 flex-col gap-4 overflow-y-auto bg-[#faf9f6] p-4 lg:h-screen lg:max-h-screen">
          {/* Brand header */}
          <div className="flex items-center gap-2.5 pb-1">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-stone-900 text-xs font-bold text-white">
              FC
            </div>
            <div>
              <div className="text-sm font-semibold tracking-tight text-stone-900">
                FieldCast
              </div>
              <div className="text-[11px] text-stone-400">
                Weather intelligence for field decisions
              </div>
            </div>
          </div>

          {error ? (
            <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">
              {error}
            </div>
          ) : null}

          {/* 1. Location summary */}
          <LocationSummary parsed={parsed} pin={pin} loading={loading} />

          {/* 2. Current weather */}
          <CurrentWeatherCard
            parsed={parsed}
            loading={loading}
            rawData={
              weather?.weather ?? { status: "waiting for first forecast" }
            }
          />

          {/* 3. Forecast timeline */}
          <ForecastTimeline parsed={parsed} loading={loading} />

          {/* Advisory with copy button (replaces SMS card) */}
          <AdvisorySection advisory={advisory} loading={loading} />
        </aside>
      </div>
    </main>
  );
}

function FloatingMetric({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Thermometer;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-xl border border-stone-200/80 bg-white/90 px-3 py-2 shadow-lg backdrop-blur">
      <div className="flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-wide text-stone-400">
        <Icon className="h-3 w-3" />
        {label}
      </div>
      <div className="mt-0.5 text-sm font-semibold text-stone-800">{value}</div>
    </div>
  );
}
