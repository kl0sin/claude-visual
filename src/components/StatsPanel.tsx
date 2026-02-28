import { useMemo } from "react";
import type { SessionStats, ClaudeEvent } from "../types";

interface StatsPanelProps {
  stats: SessionStats | null;
  events?: ClaudeEvent[];
}

function formatUptime(start?: number, end?: number): string {
  if (!start) return "00:00";
  const ms = (end || Date.now()) - start;
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  const h = Math.floor(m / 60);
  if (h > 0) return `${h}h ${m % 60}m`;
  if (m > 0) return `${m}m ${s % 60}s`;
  return `${s}s`;
}

const SPARKLINE_BUCKETS = 30;

function Sparkline({ events }: { events: ClaudeEvent[] }) {
  const buckets = useMemo(() => {
    if (events.length < 2) return [];
    const first = events[0]!.timestamp;
    const last = events[events.length - 1]!.timestamp;
    const span = last - first;
    if (span <= 0) return [];

    const bucketSize = span / SPARKLINE_BUCKETS;
    const counts = new Array(SPARKLINE_BUCKETS).fill(0) as number[];
    for (const e of events) {
      const idx = Math.min(Math.floor((e.timestamp - first) / bucketSize), SPARKLINE_BUCKETS - 1);
      counts[idx]!++;
    }
    return counts;
  }, [events]);

  if (buckets.length === 0) return null;

  const max = Math.max(...buckets, 1);
  const w = 100;
  const h = 28;
  const barW = w / buckets.length;

  return (
    <div className="sparkline-container">
      <div className="sparkline-label">EVENT RATE</div>
      <svg viewBox={`0 0 ${w} ${h}`} className="sparkline-svg" preserveAspectRatio="none">
        {buckets.map((count, i) => {
          const barH = (count / max) * h;
          return (
            <rect
              key={i}
              x={i * barW}
              y={h - barH}
              width={barW * 0.8}
              height={barH}
              fill="url(#sparkGrad)"
              opacity={0.8}
            />
          );
        })}
        <defs>
          <linearGradient id="sparkGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#00f0ff" />
            <stop offset="100%" stopColor="#00f0ff" stopOpacity="0.2" />
          </linearGradient>
        </defs>
      </svg>
    </div>
  );
}

export function StatsPanel({ stats, events = [] }: StatsPanelProps) {
  if (!stats) return null;

  const eventTypeEntries = Object.entries(stats.eventTypeCounts).sort(
    (a, b) => b[1] - a[1]
  );

  const activeCount = stats.activeAgents.filter(
    (a) => a.status === "active"
  ).length;

  return (
    <div className="panel stats-panel">
      <div className="panel-header">
        <span className="panel-icon">◉</span>
        SYSTEM DIAGNOSTICS
      </div>
      <div className="stats-grid">
        <div className="stat-card">
          <div key={stats.totalEvents} className="stat-card-value cyan">{stats.totalEvents}</div>
          <div className="stat-card-label">TOTAL EVENTS</div>
        </div>
        <div className="stat-card">
          <div key={Object.keys(stats.toolCounts).length} className="stat-card-value magenta">
            {Object.keys(stats.toolCounts).length}
          </div>
          <div className="stat-card-label">UNIQUE TOOLS</div>
        </div>
        <div className="stat-card">
          <div key={activeCount} className={`stat-card-value ${activeCount > 0 ? "green pulse" : "dim"}`}>
            {activeCount}
          </div>
          <div className="stat-card-label">ACTIVE AGENTS</div>
        </div>
        <div className="stat-card">
          <div className="stat-card-value yellow">
            {formatUptime(stats.firstEvent, stats.lastEvent)}
          </div>
          <div className="stat-card-label">SESSION TIME</div>
        </div>
      </div>

      {events.length > 1 && <Sparkline events={events} />}

      {eventTypeEntries.length > 0 && (
        <div className="event-type-breakdown">
          <div className="breakdown-title">EVENT BREAKDOWN</div>
          {eventTypeEntries.map(([type, count]) => (
            <div key={type} className="breakdown-row">
              <span className="breakdown-type">{type}</span>
              <span className="breakdown-dots" />
              <span className="breakdown-count">{count}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
