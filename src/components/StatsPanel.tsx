import type { SessionStats } from "../types";

interface StatsPanelProps {
  stats: SessionStats | null;
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

export function StatsPanel({ stats }: StatsPanelProps) {
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
          <div className="stat-card-value cyan">{stats.totalEvents}</div>
          <div className="stat-card-label">TOTAL EVENTS</div>
        </div>
        <div className="stat-card">
          <div className="stat-card-value magenta">
            {Object.keys(stats.toolCounts).length}
          </div>
          <div className="stat-card-label">UNIQUE TOOLS</div>
        </div>
        <div className="stat-card">
          <div className={`stat-card-value ${activeCount > 0 ? "green pulse" : "dim"}`}>
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
