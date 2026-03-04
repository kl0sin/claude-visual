import { useEffect, useRef, useState } from "react";

interface HistoryEvent {
  time: string;
  type: string;
  icon: string;
  color: string;
  summary: string;
}

interface Session {
  id: string;
  label: string;
  date: string;
  duration: string;
  eventCount: number;
  tokens: string;
  cost: string;
  events: HistoryEvent[];
}

const SESSIONS: Session[] = [
  {
    id: "a1b2c3",
    label: "Refactor auth module",
    date: "today, 14:23",
    duration: "4m 12s",
    eventCount: 47,
    tokens: "24.3K",
    cost: "$0.031",
    events: [
      { time: "00:00", type: "SessionStart", icon: "◎", color: "var(--color-cyber-yellow)", summary: "session a1b2c3 — claude-sonnet-4-6" },
      { time: "00:01", type: "UserPromptSubmit", icon: "▶", color: "var(--color-cyber-yellow)", summary: "Refactor the authentication module to use JWT" },
      { time: "00:05", type: "SubagentStart", icon: "◈", color: "var(--color-cyber-cyan)", summary: "Explore — reading auth files" },
      { time: "00:18", type: "PreToolUse", icon: "⚡", color: "var(--color-cyber-magenta)", summary: "Read: src/auth/session.ts" },
      { time: "00:19", type: "PostToolUse", icon: "✓", color: "var(--color-cyber-green)", summary: "Read → 203 lines" },
      { time: "00:31", type: "SubagentStop", icon: "◈", color: "var(--color-cyber-cyan)", summary: "Explore — completed (26s)" },
      { time: "00:35", type: "PreToolUse", icon: "⚡", color: "var(--color-cyber-magenta)", summary: "Edit: src/auth/session.ts" },
      { time: "00:36", type: "PostToolUse", icon: "✓", color: "var(--color-cyber-green)", summary: "Edit → 47 lines changed" },
      { time: "04:10", type: "TaskCompleted", icon: "◉", color: "var(--color-cyber-green)", summary: "JWT migration complete, tests passing" },
      { time: "04:12", type: "Stop", icon: "■", color: "var(--color-cyber-purple)", summary: "tokens: 24,312 in / 4,821 out — $0.031" },
    ],
  },
  {
    id: "b3c4d5",
    label: "Fix CI pipeline",
    date: "today, 11:05",
    duration: "1m 47s",
    eventCount: 23,
    tokens: "11.8K",
    cost: "$0.018",
    events: [
      { time: "00:00", type: "SessionStart", icon: "◎", color: "var(--color-cyber-yellow)", summary: "session b3c4d5 — claude-sonnet-4-6" },
      { time: "00:02", type: "UserPromptSubmit", icon: "▶", color: "var(--color-cyber-yellow)", summary: "Fix the failing GitHub Actions workflow" },
      { time: "00:04", type: "PreToolUse", icon: "⚡", color: "var(--color-cyber-magenta)", summary: "Read: .github/workflows/ci.yml" },
      { time: "00:05", type: "PostToolUse", icon: "✓", color: "var(--color-cyber-green)", summary: "Read → 64 lines" },
      { time: "00:08", type: "PreToolUse", icon: "⚡", color: "var(--color-cyber-magenta)", summary: "Bash: gh run view --log-failed" },
      { time: "00:11", type: "PostToolUse", icon: "✓", color: "var(--color-cyber-green)", summary: "Bash → node version mismatch identified" },
      { time: "00:14", type: "PreToolUse", icon: "⚡", color: "var(--color-cyber-magenta)", summary: "Edit: .github/workflows/ci.yml" },
      { time: "00:15", type: "PostToolUse", icon: "✓", color: "var(--color-cyber-green)", summary: "Edit → node 20 → setup-bun@v2" },
      { time: "01:47", type: "Stop", icon: "■", color: "var(--color-cyber-purple)", summary: "tokens: 11,820 in / 2,103 out — $0.018" },
    ],
  },
  {
    id: "e5f6g7",
    label: "Add dark mode toggle",
    date: "yesterday",
    duration: "7m 03s",
    eventCount: 89,
    tokens: "51.2K",
    cost: "$0.067",
    events: [
      { time: "00:00", type: "SessionStart", icon: "◎", color: "var(--color-cyber-yellow)", summary: "session e5f6g7 — claude-sonnet-4-6" },
      { time: "00:03", type: "UserPromptSubmit", icon: "▶", color: "var(--color-cyber-yellow)", summary: "Implement dark/light mode toggle with persistence" },
      { time: "00:06", type: "SubagentStart", icon: "◈", color: "var(--color-cyber-cyan)", summary: "Plan — designing theme system architecture" },
      { time: "00:24", type: "SubagentStop", icon: "◈", color: "var(--color-cyber-cyan)", summary: "Plan — completed (18s)" },
      { time: "00:27", type: "PreToolUse", icon: "⚡", color: "var(--color-cyber-magenta)", summary: "Write: src/hooks/useTheme.ts" },
      { time: "00:28", type: "PostToolUse", icon: "✓", color: "var(--color-cyber-green)", summary: "Write → created (87 lines)" },
      { time: "00:31", type: "PreToolUse", icon: "⚡", color: "var(--color-cyber-magenta)", summary: "Edit: src/App.tsx" },
      { time: "00:32", type: "PostToolUse", icon: "✓", color: "var(--color-cyber-green)", summary: "Edit → ThemeProvider wrapper added" },
      { time: "07:01", type: "TaskCompleted", icon: "◉", color: "var(--color-cyber-green)", summary: "Dark mode with localStorage persistence done" },
      { time: "07:03", type: "Stop", icon: "■", color: "var(--color-cyber-purple)", summary: "tokens: 51,204 in / 9,847 out — $0.067" },
    ],
  },
  {
    id: "f7g8h9",
    label: "Write unit tests",
    date: "2 days ago",
    duration: "2m 31s",
    eventCount: 12,
    tokens: "8.4K",
    cost: "$0.009",
    events: [
      { time: "00:00", type: "SessionStart", icon: "◎", color: "var(--color-cyber-yellow)", summary: "session f7g8h9 — claude-sonnet-4-6" },
      { time: "00:02", type: "UserPromptSubmit", icon: "▶", color: "var(--color-cyber-yellow)", summary: "Add unit tests for the EventStore class" },
      { time: "00:04", type: "PreToolUse", icon: "⚡", color: "var(--color-cyber-magenta)", summary: "Read: server/events.ts" },
      { time: "00:05", type: "PostToolUse", icon: "✓", color: "var(--color-cyber-green)", summary: "Read → 142 lines" },
      { time: "00:09", type: "PreToolUse", icon: "⚡", color: "var(--color-cyber-magenta)", summary: "Write: server/events.test.ts" },
      { time: "00:10", type: "PostToolUse", icon: "✓", color: "var(--color-cyber-green)", summary: "Write → 8 test cases" },
      { time: "00:12", type: "PreToolUse", icon: "⚡", color: "var(--color-cyber-magenta)", summary: "Bash: bun test" },
      { time: "00:14", type: "PostToolUse", icon: "✓", color: "var(--color-cyber-green)", summary: "Bash → 8 passed, 0 failed" },
      { time: "02:29", type: "TaskCompleted", icon: "◉", color: "var(--color-cyber-green)", summary: "All tests passing" },
      { time: "02:31", type: "Stop", icon: "■", color: "var(--color-cyber-purple)", summary: "tokens: 8,401 in / 1,204 out — $0.009" },
    ],
  },
];

export function DemoHistory() {
  const [activeIndex, setActiveIndex] = useState(0);
  const [visibleEvents, setVisibleEvents] = useState<HistoryEvent[]>([]);
  const [isReplaying, setIsReplaying] = useState(false);
  const feedRef = useRef<HTMLDivElement>(null);
  const replayTimersRef = useRef<ReturnType<typeof setTimeout>[]>([]);

  // Replay events for current activeIndex
  useEffect(() => {
    replayTimersRef.current.forEach(clearTimeout);
    replayTimersRef.current = [];

    setVisibleEvents([]);
    setIsReplaying(true);

    const events = SESSIONS[activeIndex]!.events;
    events.forEach((ev, i) => {
      const t = setTimeout(() => {
        setVisibleEvents((prev) => [...prev, ev]);
        if (i === events.length - 1) setIsReplaying(false);
      }, i * 80);
      replayTimersRef.current.push(t);
    });

    return () => {
      replayTimersRef.current.forEach(clearTimeout);
      replayTimersRef.current = [];
    };
  }, [activeIndex]);

  // Auto-advance to next session
  useEffect(() => {
    const t = setTimeout(() => {
      setActiveIndex((prev) => (prev + 1) % SESSIONS.length);
    }, 6500);
    return () => clearTimeout(t);
  }, [activeIndex]);

  // Auto-scroll feed
  useEffect(() => {
    if (feedRef.current) {
      feedRef.current.scrollTop = feedRef.current.scrollHeight;
    }
  }, [visibleEvents]);

  const session = SESSIONS[activeIndex]!;

  return (
    <div className="demo-terminal">
      <div className="demo-terminal-header">
        <div className="demo-terminal-title">
          <span style={{ color: "var(--color-cyber-purple)" }}>◷</span>
          SESSION HISTORY BROWSER
        </div>
        <span className="demo-terminal-tag">SIMULATED</span>
      </div>

      <div className="demo-history-body">
        {/* Session list */}
        <div className="demo-history-sidebar">
          <div className="demo-history-sidebar-header">SESSIONS</div>
          {SESSIONS.map((s, i) => (
            <button
              key={s.id}
              className={`demo-history-session ${i === activeIndex ? "active" : ""}`}
              onClick={() => setActiveIndex(i)}
            >
              <span className="demo-history-session-label">{s.label}</span>
              <span className="demo-history-session-date">{s.date}</span>
              <div className="demo-history-session-meta">
                <span>{s.eventCount} events</span>
                <span className="demo-history-session-cost">{s.cost}</span>
              </div>
            </button>
          ))}
        </div>

        {/* Event feed */}
        <div className="demo-history-feed" ref={feedRef}>
          <div className="demo-history-feed-header">
            <span className="demo-history-feed-title">{session.label}</span>
            <span className="demo-history-feed-meta">
              {session.duration} · {session.tokens} tokens
            </span>
          </div>

          {visibleEvents.map((ev, i) => (
            <div key={i} className="demo-event-row">
              <span className="demo-event-time">{ev.time}</span>
              <span className="demo-event-icon" style={{ color: ev.color }}>{ev.icon}</span>
              <span className="demo-event-type" style={{ color: ev.color }}>{ev.type}</span>
              <span className="demo-event-summary">{ev.summary}</span>
            </div>
          ))}

          {isReplaying && (
            <div className="demo-event-row">
              <span className="demo-event-time" />
              <span className="demo-cursor">▊</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
