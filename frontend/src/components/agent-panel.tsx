"use client";

import { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import {
  AlertTriangle,
  ArrowUp,
  Bot,
  Check,
  ChevronRight,
  Loader2,
  MapPin,
  Sparkles,
  Wrench,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import type { ChatEvent, ChatTurn } from "@/lib/weather";

type ToolEvent = {
  id: string;
  tool: string;
  input?: Record<string, unknown> | null;
  summary?: string;
  status: "running" | "completed";
};

function buildToolEvents(events: ChatEvent[]): ToolEvent[] {
  const items: ToolEvent[] = [];
  const indexByCallId = new Map<string, number>();

  events.forEach((event, index) => {
    if (event.type === "tool_start") {
      const id = event.tool_call_id || `${event.tool}-${index}`;
      indexByCallId.set(id, items.length);
      const input = event.input ?? {};
      items.push({
        id,
        tool: event.tool,
        input: Object.keys(input).length > 0 ? input : undefined,
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

const SUGGESTIONS = [
  "Should I spray crops here tomorrow afternoon?",
  "Any flood or wind risk tonight?",
  "Is it safe to harvest today?",
  "When's the next dry window this week?",
];

const TOOL_LABELS: Record<string, string> = {
  get_weather: "Fetching weather information",
};

function getToolLabel(tool: string, running: boolean) {
  const label = TOOL_LABELS[tool] ?? tool;
  return running ? label : `${label} completed`;
}

export function AgentPanel({
  question,
  onQuestionChange,
  turns,
  activeTurnId,
  running,
  onAsk,
  pin,
  inDialog,
}: {
  question: string;
  onQuestionChange: (value: string) => void;
  turns: ChatTurn[];
  activeTurnId: string | null;
  running: boolean;
  onAsk: (message: string) => void;
  pin: { lat: number; lon: number };
  inDialog?: boolean;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const hasActivity = turns.length > 0 || running;

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [turns, running]);

  useEffect(() => {
    if (!textareaRef.current) return;
    textareaRef.current.style.height = "auto";
    textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 200)}px`;
  }, [question]);

  function handleSubmit() {
    if (!question.trim() || running) return;
    onAsk(question);
    onQuestionChange("");
  }

  function handleSuggestion(suggestion: string) {
    onQuestionChange(suggestion);
    onAsk(suggestion);
    onQuestionChange("");
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      handleSubmit();
    }
  }

  return (
    <div
      className={cn(
        "flex min-h-0 flex-1 flex-col overflow-hidden bg-white",
        inDialog
          ? "rounded-none"
          : "rounded-2xl border border-stone-200/80 shadow-sm",
      )}
    >
      {!inDialog ? (
        <div className="flex items-center gap-2 border-b border-stone-100 px-4 py-3">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-stone-900 text-white">
            <Sparkles className="h-3.5 w-3.5" />
          </div>
          <div className="min-w-0">
            <div className="text-sm font-semibold text-stone-800">
              Weather agent
            </div>
            <div className="truncate text-[11px] text-stone-400">
              Grounded in live WeatherAI data
            </div>
          </div>
          {running ? (
            <span className="ml-auto inline-flex items-center gap-1.5 rounded-full bg-stone-100 px-2 py-0.5 text-[11px] font-medium text-stone-500">
              <Loader2 className="h-3 w-3 animate-spin" />
              Thinking
            </span>
          ) : null}
        </div>
      ) : null}

      <div
        ref={scrollRef}
        className="scroll-area min-h-0 flex-1 overflow-y-auto px-4 py-4"
      >
        {!hasActivity ? (
          <EmptyState pin={pin} />
        ) : (
          <div className="space-y-5">
            {turns.map((turn) => {
              const toolEvents = buildToolEvents(turn.events);
              const contextEvent = turn.events.find(
                (event) => event.type === "context",
              );
              const errorEvent = turn.events.find(
                (event) => event.type === "error",
              );
              const isActive = turn.id === activeTurnId;
              const isRunning = isActive && running;
              const allToolsCompleted =
                toolEvents.length > 0 &&
                toolEvents.every(
                  (toolEvent) => toolEvent.status === "completed",
                );

              return (
                <div key={turn.id} className="space-y-3">
                  <UserBubble text={turn.question} />

                  {contextEvent?.type === "context" ? (
                    <ContextChip
                      lat={contextEvent.lat}
                      lon={contextEvent.lon}
                      days={contextEvent.days}
                    />
                  ) : null}

                  {toolEvents.map((toolEvent) => (
                    <ToolCallRow key={toolEvent.id} toolEvent={toolEvent} />
                  ))}

                  {turn.answer ? (
                    <AnswerBubble text={turn.answer} running={isRunning} />
                  ) : isRunning && !toolEvents.length ? (
                    <WaitingForModel />
                  ) : null}

                  {isRunning && allToolsCompleted && !turn.answer ? (
                    <WaitingForModel />
                  ) : null}

                  {turn.error ? (
                    <ErrorRow message={turn.error} />
                  ) : errorEvent?.type === "error" ? (
                    <ErrorRow message={errorEvent.message} />
                  ) : null}
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="shrink-0 border-t border-stone-100 p-3">
        {!hasActivity ? (
          <div className="mb-2.5 flex flex-wrap gap-1.5">
            {SUGGESTIONS.map((suggestion) => (
              <button
                key={suggestion}
                type="button"
                onClick={() => handleSuggestion(suggestion)}
                className="rounded-full border border-stone-200 bg-stone-50 px-2.5 py-1 text-[11px] text-stone-500 transition hover:border-stone-300 hover:bg-white hover:text-stone-700"
              >
                {suggestion}
              </button>
            ))}
          </div>
        ) : null}

        <div className="relative rounded-xl border border-stone-200 bg-white shadow-sm transition focus-within:border-stone-400 focus-within:ring-2 focus-within:ring-stone-300/60">
          <Textarea
            ref={textareaRef}
            value={question}
            onChange={(event) => onQuestionChange(event.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask about the weather, field conditions, or timing…"
            className="min-h-[56px] border-0 bg-transparent shadow-none focus-visible:ring-0"
            rows={2}
          />
          <div className="flex items-center justify-between gap-2 px-2 pb-2">
            <div className="flex items-center gap-1 px-1.5 text-[11px] text-stone-400">
              <kbd className="rounded border border-stone-200 bg-stone-50 px-1 py-0.5 font-sans text-[10px]">
                ↵
              </kbd>
              to send
            </div>
            <Button
              type="button"
              size="icon"
              onClick={handleSubmit}
              disabled={!question.trim() || running}
              className="h-8 w-8 rounded-lg"
              aria-label="Send message"
            >
              {running ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <ArrowUp className="h-4 w-4" />
              )}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */

function EmptyState({ pin }: { pin: { lat: number; lon: number } }) {
  return (
    <div className="flex flex-col items-center justify-center py-6 text-center">
      <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-stone-100 text-stone-400">
        <Bot className="h-5 w-5" />
      </div>
      <p className="mt-2.5 max-w-[280px] text-[13px] leading-relaxed text-stone-500">
        Ask about the weather at this pin. The agent calls WeatherAI live and
        streams its reasoning.
      </p>
      <div className="mt-2 inline-flex items-center gap-1 rounded-full bg-stone-50 px-2 py-0.5 font-mono text-[11px] text-stone-400">
        <MapPin className="h-3 w-3" />
        {pin.lat.toFixed(3)}, {pin.lon.toFixed(3)}
      </div>
    </div>
  );
}

function ContextChip({
  lat,
  lon,
  days,
}: {
  lat: number;
  lon: number;
  days: number;
}) {
  return (
    <div className="inline-flex items-center gap-1.5 rounded-full bg-stone-100 px-2.5 py-1 text-[11px] font-medium text-stone-500">
      <MapPin className="h-3 w-3" />
      Context {lat.toFixed(3)}, {lon.toFixed(3)} · {days}d
    </div>
  );
}

function UserBubble({ text }: { text: string }) {
  return (
    <div className="flex justify-end">
      <div className="max-w-[85%] rounded-2xl rounded-br-md bg-stone-900 px-3.5 py-2 text-sm text-white">
        {text}
      </div>
    </div>
  );
}

function ToolCallRow({ toolEvent }: { toolEvent: ToolEvent }) {
  const [expanded, setExpanded] = useState(toolEvent.status === "running");
  const isRunning = toolEvent.status === "running";
  const hasInput = toolEvent.input && Object.keys(toolEvent.input).length > 0;

  return (
    <div className="overflow-hidden rounded-xl border border-stone-200/70 bg-stone-50/60">
      <button
        type="button"
        onClick={() => setExpanded((value) => !value)}
        className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs"
      >
        <span
          className={cn(
            "flex h-5 w-5 shrink-0 items-center justify-center rounded-md",
            isRunning
              ? "bg-amber-100 text-amber-700"
              : "bg-emerald-100 text-emerald-700",
          )}
        >
          {isRunning ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : (
            <Check className="h-3 w-3" />
          )}
        </span>
        <span className="flex-1 font-medium text-stone-700">
          {getToolLabel(toolEvent.tool, isRunning)}
        </span>
        <span
          className={cn(
            "text-[10px] font-medium uppercase tracking-wide",
            isRunning ? "text-amber-600" : "text-emerald-600",
          )}
        >
          {isRunning ? "Running" : "Done"}
        </span>
        <ChevronRight
          className={cn(
            "h-3.5 w-3.5 text-stone-400 transition-transform",
            expanded && "rotate-90",
          )}
        />
      </button>
      {expanded ? (
        <div className="space-y-2 border-t border-stone-200/70 px-3 py-2.5">
          <div className="flex items-center gap-1.5 text-[11px] font-medium text-stone-500">
            <Wrench className="h-3 w-3" />
            Tool input
          </div>
          {hasInput ? (
            <pre className="scroll-area overflow-auto rounded-lg bg-white p-2 font-mono text-[11px] text-stone-500">
              {JSON.stringify(toolEvent.input, null, 2)}
            </pre>
          ) : (
            <p className="text-[11px] italic text-stone-400">
              Input hidden or not provided
            </p>
          )}
          {toolEvent.summary ? (
            <p className="text-xs leading-relaxed text-stone-500">
              {toolEvent.summary}
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function AnswerBubble({ text, running }: { text: string; running: boolean }) {
  return (
    <div className="flex gap-2.5">
      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-stone-100 text-stone-500">
        <Sparkles className="h-3.5 w-3.5" />
      </div>
      <div className="min-w-0 flex-1 rounded-2xl rounded-tl-md border border-stone-200/70 bg-white px-3.5 py-2.5">
        <div
          className={cn(
            "prose prose-sm max-w-none text-[13px] text-stone-700",
            running && "stream-caret",
          )}
        >
          <ReactMarkdown
            components={{
              p: ({ children }) => (
                <p className="leading-snug [&:not(:last-child)]:mb-2">
                  {children}
                </p>
              ),
              ul: ({ children }) => (
                <ul className="my-1.5 list-disc pl-4">{children}</ul>
              ),
              ol: ({ children }) => (
                <ol className="my-1.5 list-decimal pl-4">{children}</ol>
              ),
              li: ({ children }) => (
                <li className="mb-0.5 leading-snug">{children}</li>
              ),
              strong: ({ children }) => (
                <strong className="font-semibold text-stone-900">
                  {children}
                </strong>
              ),
              a: ({ children, href }) => (
                <a
                  href={href}
                  target="_blank"
                  rel="noreferrer"
                  className="font-medium text-amber-600 underline hover:text-amber-700"
                >
                  {children}
                </a>
              ),
              code: ({ children }) => (
                <code className="rounded bg-stone-100 px-1 py-0.5 font-mono text-[11px] text-stone-600">
                  {children}
                </code>
              ),
            }}
          >
            {text}
          </ReactMarkdown>
        </div>
      </div>
    </div>
  );
}

function WaitingForModel() {
  return (
    <div className="flex gap-2.5">
      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-stone-100 text-stone-400">
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
      </div>
      <div className="flex items-center gap-1.5 rounded-2xl rounded-tl-md border border-stone-200/70 bg-white px-3.5 py-2.5">
        <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-stone-300 [animation-delay:-0.3s]" />
        <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-stone-300 [animation-delay:-0.15s]" />
        <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-stone-300" />
      </div>
    </div>
  );
}

function ErrorRow({ message }: { message: string }) {
  return (
    <div className="flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2.5 text-xs text-rose-700">
      <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
      <span className="leading-relaxed">{message}</span>
    </div>
  );
}

/* ------------------------------------------------------------------ */
