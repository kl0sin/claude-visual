import { useState, useEffect } from "react";
import type { ProjectStats } from "../../shared/types";
import { formatCost, getModelLabel } from "../../shared/tokens";

const API_BASE = (window as any).__TAURI__ ? "http://localhost:3200" : "";

function formatTokenCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toLocaleString();
}

function modelColor(model: string): string {
  const lower = model.toLowerCase();
  if (lower.includes("opus")) return "var(--color-cyber-magenta)";
  if (lower.includes("haiku")) return "var(--color-cyber-green)";
  return "var(--color-cyber-cyan)";
}

interface HistoricalStatsPanelProps {
  projectId: string;
  projectName: string;
}

export function HistoricalStatsPanel({ projectId, projectName }: HistoricalStatsPanelProps) {
  const [stats, setStats] = useState<ProjectStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    setStats(null);

    fetch(`${API_BASE}/api/history/stats?project=${encodeURIComponent(projectId)}`)
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json() as Promise<ProjectStats>;
      })
      .then((data) => {
        setStats(data);
        setLoading(false);
      })
      .catch((err) => {
        setError(String(err));
        setLoading(false);
      });
  }, [projectId]);

  if (loading) {
    return (
      <div className="history-empty">
        <span className="history-empty-icon" style={{ fontSize: "11px", letterSpacing: "0.15em" }}>
          LOADING STATISTICS…
        </span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="history-empty">
        <span style={{ color: "var(--color-cyber-red)", fontSize: "11px" }}>{error}</span>
      </div>
    );
  }

  if (!stats) {
    return (
      <div className="history-empty">
        <span>NO DATA</span>
      </div>
    );
  }

  // Sparkline
  const maxDayCount = Math.max(...stats.sessionsByDay.map((d) => d.count), 1);
  const firstDay = stats.sessionsByDay[0]?.date ?? "";
  const lastDay = stats.sessionsByDay[stats.sessionsByDay.length - 1]?.date ?? "";
  const SVG_W = 100;
  const SVG_H = 44;
  const BAR_COUNT = stats.sessionsByDay.length;
  const barW = SVG_W / BAR_COUNT;

  // Model breakdown
  const maxModelCost = Math.max(...stats.modelBreakdown.map((m) => m.cost), 0.000001);

  // Tool counts
  const maxToolCount = Math.max(...stats.toolCounts.map((t) => t.count), 1);

  return (
    <div className="hist-stats-panel">
      {/* Section 1: KPI Grid */}
      <div className="hist-stats-section">
        <div className="stats-grid">
          <div className="stat-card">
            <div className="stat-card-value cyan">{stats.totalSessions}</div>
            <div className="stat-label">SESSIONS</div>
          </div>
          <div className="stat-card">
            <div className="stat-card-value yellow">{formatTokenCount(stats.totalTokens.totalTokens)}</div>
            <div className="stat-label">TOKENS</div>
          </div>
          <div className="stat-card">
            <div className="stat-card-value magenta">{formatCost(stats.totalCost)}</div>
            <div className="stat-label">TOTAL COST</div>
          </div>
          <div className="stat-card">
            <div className="stat-card-value green">{formatCost(stats.avgCostPerSession)}</div>
            <div className="stat-label">AVG/SESSION</div>
          </div>
        </div>
      </div>

      {/* Section 2: Sessions by day sparkline */}
      <div className="hist-stats-section">
        <div className="hist-stats-section-title">SESSIONS BY DAY (30D)</div>
        <svg
          viewBox={`0 0 ${SVG_W} ${SVG_H}`}
          className="hist-sparkline-svg"
          preserveAspectRatio="none"
          role="img"
          aria-label="Sessions per day over the last 30 days"
        >
          <title>Sessions per day (last 30 days)</title>
          <defs>
            <linearGradient id="histSparkGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#00f0ff" />
              <stop offset="100%" stopColor="#00f0ff" stopOpacity="0.2" />
            </linearGradient>
          </defs>
          {stats.sessionsByDay.map((day, i) => {
            const barH = (day.count / maxDayCount) * SVG_H;
            return (
              <rect
                key={day.date}
                x={i * barW}
                y={SVG_H - barH}
                width={barW * 0.8}
                height={barH}
                fill="url(#histSparkGrad)"
                opacity={0.85}
              />
            );
          })}
        </svg>
        <div className="hist-sparkline-labels">
          <span>{firstDay}</span>
          <span>{lastDay}</span>
        </div>
      </div>

      {/* Section 3: Model breakdown */}
      {stats.modelBreakdown.length > 0 && (
        <div className="hist-stats-section">
          <div className="hist-stats-section-title">MODEL BREAKDOWN</div>
          {stats.modelBreakdown.map((m) => {
            const pct = maxModelCost > 0 ? (m.cost / maxModelCost) * 100 : 0;
            const color = modelColor(m.model);
            return (
              <div key={m.model} className="hist-model-row">
                <span className="hist-model-name">{getModelLabel(m.model)}</span>
                <div className="tool-bar-container" style={{ flex: 1 }}>
                  <div
                    className="tool-bar"
                    style={{
                      width: `${pct}%`,
                      background: color,
                      boxShadow: `0 0 6px ${color}`,
                    }}
                  />
                </div>
                <span className="hist-model-cost">{formatCost(m.cost)}</span>
                <span className="hist-model-sessions">×{m.sessions}</span>
              </div>
            );
          })}
        </div>
      )}

      {/* Section 4: Top tools */}
      {stats.toolCounts.length > 0 && (
        <div className="hist-stats-section">
          <div className="hist-stats-section-title">TOP TOOLS</div>
          {stats.toolCounts.map((t) => {
            const pct = (t.count / maxToolCount) * 100;
            return (
              <div key={t.tool} className="hist-tool-row">
                <span className="hist-tool-name">{t.tool}</span>
                <div className="tool-bar-container" style={{ flex: 1 }}>
                  <div
                    className="tool-bar"
                    style={{
                      width: `${pct}%`,
                      background: "var(--color-cyber-cyan)",
                      boxShadow: "0 0 6px var(--color-cyber-cyan)",
                    }}
                  />
                </div>
                <span className="hist-tool-count">{t.count}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
