import { useEffect, useState } from "react";

const TOOLS = [
  { name: "Read", count: 1847, color: "#00f0ff" },
  { name: "Edit", count: 1203, color: "#ff2d95" },
  { name: "Bash", count: 892, color: "#f0ff00" },
  { name: "Glob", count: 634, color: "#00ff9f" },
  { name: "Grep", count: 521, color: "#8b5cf6" },
];

const MAX_TOOL = 1847;

const SPARKLINE = [
  12, 8, 15, 23, 19, 31, 28, 42, 38, 35, 47, 52, 44, 61, 58, 49, 67, 71, 63,
  75, 69, 82, 78, 88, 84, 91, 87, 95, 89, 98,
];

const MODELS = [
  { name: "sonnet-4-6", pct: 68, color: "#00f0ff" },
  { name: "opus-4-6", pct: 24, color: "#ff2d95" },
  { name: "haiku-4-5", pct: 8, color: "#8b5cf6" },
];

const KPI = [
  { label: "SESSIONS", value: "47", color: "#00f0ff" },
  { label: "TOKENS", value: "1.2M", color: "#ff2d95" },
  { label: "TOTAL COST", value: "$15.42", color: "#00ff9f" },
  { label: "AVG / SESSION", value: "$0.33", color: "#f0ff00" },
];

export function DemoStats() {
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setLoaded(true), 400);
    return () => clearTimeout(t);
  }, []);

  const maxSpark = Math.max(...SPARKLINE);
  const W = 100;
  const H = 38;

  const sparkPoints = SPARKLINE.map((v, i) => {
    const x = (i / (SPARKLINE.length - 1)) * W;
    const y = H - (v / maxSpark) * H;
    return [x, y] as [number, number];
  });

  const polylinePoints = sparkPoints.map(([x, y]) => `${x},${y}`).join(" ");
  const polygonPoints = `0,${H} ${polylinePoints} ${W},${H}`;

  return (
    <div className="demo-terminal">
      <div className="demo-terminal-header">
        <div className="demo-terminal-title">
          <span style={{ color: "#00ff9f" }}>▦</span>
          HISTORICAL ANALYTICS
        </div>
        <span className="demo-terminal-tag">SIMULATED</span>
      </div>

      <div className="demo-stats-body">
        <div className="demo-kpi-row">
          {KPI.map((k) => (
            <div
              key={k.label}
              className="demo-kpi-card"
              style={{ "--kpi-color": k.color } as React.CSSProperties}
            >
              <p className="demo-kpi-label">{k.label}</p>
              <p className="demo-kpi-value">{k.value}</p>
            </div>
          ))}
        </div>

        <div className="demo-stats-cols">
          <div className="demo-stats-panel">
            <p className="demo-stats-panel-title">TOP TOOLS — ALL TIME</p>
            {TOOLS.map((t) => (
              <div key={t.name} className="demo-tool-row">
                <span className="demo-tool-name">{t.name}</span>
                <div className="demo-tool-bar-track">
                  <div
                    className="demo-tool-bar"
                    style={{
                      width: loaded ? `${(t.count / MAX_TOOL) * 100}%` : "0%",
                      background: t.color,
                    }}
                  />
                </div>
                <span className="demo-tool-count">{t.count.toLocaleString()}</span>
              </div>
            ))}
          </div>

          <div className="demo-stats-panel">
            <p className="demo-stats-panel-title">30-DAY SESSIONS</p>
            <svg
              className="demo-sparkline"
              viewBox={`0 0 ${W} ${H}`}
              preserveAspectRatio="none"
            >
              <defs>
                <linearGradient id="spark-grad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#00f0ff" stopOpacity="0.25" />
                  <stop offset="100%" stopColor="#00f0ff" stopOpacity="0" />
                </linearGradient>
              </defs>
              <polygon points={polygonPoints} fill="url(#spark-grad)" />
              <polyline
                points={polylinePoints}
                fill="none"
                stroke="#00f0ff"
                strokeWidth="1.5"
                vectorEffect="non-scaling-stroke"
              />
            </svg>

            <p className="demo-stats-panel-title" style={{ marginTop: 12 }}>
              MODEL BREAKDOWN
            </p>
            {MODELS.map((m) => (
              <div key={m.name} className="demo-tool-row">
                <span
                  className="demo-tool-name"
                  style={{ color: m.color, minWidth: 80 }}
                >
                  {m.name}
                </span>
                <div className="demo-tool-bar-track">
                  <div
                    className="demo-tool-bar"
                    style={{
                      width: loaded ? `${m.pct}%` : "0%",
                      background: m.color,
                    }}
                  />
                </div>
                <span className="demo-tool-count">{m.pct}%</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
