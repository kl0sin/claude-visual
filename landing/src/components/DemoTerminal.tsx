import { useEffect, useRef, useState } from "react";

interface FakeEvent {
  delay: number;
  type: string;
  icon: string;
  color: string;
  summary: string;
}

const FAKE_SCENARIO: FakeEvent[] = [
  {
    delay: 400,
    type: "SessionStart",
    icon: "◎",
    color: "#f0ff00",
    summary: "session abc123 — claude-sonnet-4-6",
  },
  {
    delay: 800,
    type: "UserPromptSubmit",
    icon: "▶",
    color: "#f0ff00",
    summary: "Implement the landing page following the plan",
  },
  {
    delay: 1200,
    type: "SubagentStart",
    icon: "◈",
    color: "#00f0ff",
    summary: "Explore — exploring codebase structure",
  },
  {
    delay: 1600,
    type: "PreToolUse",
    icon: "⚡",
    color: "#ff2d95",
    summary: "Glob: src/components/**/*.tsx",
  },
  {
    delay: 1900,
    type: "PostToolUse",
    icon: "✓",
    color: "#00ff9f",
    summary: "Glob → 12 files matched",
  },
  {
    delay: 2200,
    type: "PreToolUse",
    icon: "⚡",
    color: "#ff2d95",
    summary: "Read: src/index.css",
  },
  {
    delay: 2500,
    type: "PostToolUse",
    icon: "✓",
    color: "#00ff9f",
    summary: "Read → 847 lines",
  },
  {
    delay: 2800,
    type: "PreToolUse",
    icon: "⚡",
    color: "#ff2d95",
    summary: "Grep: @theme",
  },
  {
    delay: 3100,
    type: "PostToolUse",
    icon: "✓",
    color: "#00ff9f",
    summary: "Grep → 1 match in src/index.css",
  },
  {
    delay: 3600,
    type: "SubagentStop",
    icon: "◈",
    color: "#00f0ff",
    summary: "Explore — completed (3.2s)",
  },
  {
    delay: 4000,
    type: "SubagentStart",
    icon: "◈",
    color: "#00f0ff",
    summary: "Plan — designing implementation strategy",
  },
  {
    delay: 4800,
    type: "SubagentStop",
    icon: "◈",
    color: "#00f0ff",
    summary: "Plan — completed (0.8s)",
  },
  {
    delay: 5200,
    type: "PreToolUse",
    icon: "⚡",
    color: "#ff2d95",
    summary: "Write: landing/package.json",
  },
  {
    delay: 5400,
    type: "PostToolUse",
    icon: "✓",
    color: "#00ff9f",
    summary: "Write → created",
  },
  {
    delay: 5600,
    type: "PreToolUse",
    icon: "⚡",
    color: "#ff2d95",
    summary: "Write: landing/src/components/DemoTerminal.tsx",
  },
  {
    delay: 5900,
    type: "PostToolUse",
    icon: "✓",
    color: "#00ff9f",
    summary: "Write → created",
  },
  {
    delay: 6200,
    type: "PreToolUse",
    icon: "⚡",
    color: "#ff2d95",
    summary: "Bash: cd landing && bun install && bun run build",
  },
  {
    delay: 7100,
    type: "PostToolUse",
    icon: "✓",
    color: "#00ff9f",
    summary: "Bash → build succeeded in 4.2s",
  },
  {
    delay: 7500,
    type: "TaskCompleted",
    icon: "◉",
    color: "#00ff9f",
    summary: "Landing page deployed to gh-pages",
  },
  {
    delay: 7900,
    type: "Stop",
    icon: "■",
    color: "#8b5cf6",
    summary: "tokens: 18,432 in / 3,847 out — $0.042",
  },
];

function formatTime(ms: number): string {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  return `${String(m).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}

export function DemoTerminal() {
  const [visibleCount, setVisibleCount] = useState(0);
  const [eventTimes, setEventTimes] = useState<number[]>([]);
  const [isRunning, setIsRunning] = useState(true);
  const [fadeOut, setFadeOut] = useState(false);
  const bodyRef = useRef<HTMLDivElement>(null);
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([]);

  const clearTimers = () => {
    timersRef.current.forEach(clearTimeout);
    timersRef.current = [];
  };

  const runScenario = () => {
    setVisibleCount(0);
    setEventTimes([]);
    setFadeOut(false);
    setIsRunning(true);
    const base = Date.now();

    FAKE_SCENARIO.forEach((ev) => {
      const t = setTimeout(() => {
        setVisibleCount((c) => c + 1);
        setEventTimes((prev) => [...prev, Date.now() - base]);
      }, ev.delay);
      timersRef.current.push(t);
    });

    const lastDelay = FAKE_SCENARIO[FAKE_SCENARIO.length - 1].delay;

    // pause at end
    const pauseT = setTimeout(() => {
      setIsRunning(false);
    }, lastDelay + 100);
    timersRef.current.push(pauseT);

    // fade out
    const fadeT = setTimeout(() => {
      setFadeOut(true);
    }, lastDelay + 3000);
    timersRef.current.push(fadeT);

    // restart
    const restartT = setTimeout(() => {
      clearTimers();
      runScenario();
    }, lastDelay + 3600);
    timersRef.current.push(restartT);
  };

  useEffect(() => {
    runScenario();
    return clearTimers;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // auto-scroll
  useEffect(() => {
    if (bodyRef.current) {
      bodyRef.current.scrollTop = bodyRef.current.scrollHeight;
    }
  }, [visibleCount]);

  const visible = FAKE_SCENARIO.slice(0, visibleCount);

  return (
    <div className="demo-terminal" style={{ opacity: fadeOut ? 0 : 1, transition: "opacity 0.5s" }}>
      <div className="demo-terminal-header">
        <div className="demo-terminal-title">
          <span className="demo-terminal-dot" />
          ◉ LIVE EVENT FEED
        </div>
        <span className="demo-terminal-tag">SIMULATED</span>
      </div>

      <div className="demo-terminal-body" ref={bodyRef}>
        {visible.map((ev, i) => (
          <div key={i} className="demo-event-row">
            <span className="demo-event-time">
              {formatTime(eventTimes[i] ?? 0)}
            </span>
            <span className="demo-event-icon" style={{ color: ev.color }}>
              {ev.icon}
            </span>
            <span className="demo-event-type" style={{ color: ev.color }}>
              {ev.type}
            </span>
            <span className="demo-event-summary">{ev.summary}</span>
          </div>
        ))}
        {isRunning && visibleCount < FAKE_SCENARIO.length && (
          <div className="demo-event-row">
            <span className="demo-event-time" />
            <span className="demo-cursor">▊</span>
          </div>
        )}
      </div>
    </div>
  );
}
