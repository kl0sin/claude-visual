interface ToolStatsProps {
  toolCounts: Record<string, number>;
  toolFailCounts?: Record<string, number>;
}

const TOOL_COLORS: Record<string, string> = {
  Bash: "#ff2d95",
  Read: "#00f0ff",
  Write: "#f0ff00",
  Edit: "#00ff9f",
  Glob: "#8b5cf6",
  Grep: "#06b6d4",
  Task: "#ffaa00",
  TaskUpdate: "#ff6b00",
  TaskCreate: "#ff6b00",
  TodoWrite: "#ff6b00",
  WebSearch: "#ff0040",
  WebFetch: "#ff0040",
};

export function ToolStats({ toolCounts, toolFailCounts = {} }: ToolStatsProps) {
  const sorted = Object.entries(toolCounts).sort((a, b) => b[1] - a[1]);
  const max = sorted[0]?.[1] || 1;

  return (
    <div className="panel tool-stats">
      <div className="panel-header">
        <span className="panel-icon">⚡</span>
        TOOL USAGE
      </div>
      <div className="tool-list">
        {sorted.length === 0 ? (
          <div className="tool-empty">No tools invoked</div>
        ) : (
          sorted.map(([tool, count]) => {
            const color = TOOL_COLORS[tool] || "#8892a8";
            const fails = toolFailCounts[tool] || 0;
            const pct = (count / max) * 100;

            return (
              <div key={tool} className="tool-row">
                <span className="tool-name" style={{ color }}>
                  {tool}
                </span>
                <div className="tool-bar-container">
                  <div
                    className="tool-bar"
                    style={{
                      width: `${pct}%`,
                      background: `linear-gradient(90deg, ${color}, ${color}88)`,
                      boxShadow: `0 0 8px ${color}44`,
                    }}
                  />
                </div>
                <span className="tool-count" style={{ color }}>
                  {count}
                </span>
                {fails > 0 && (
                  <span
                    className="tool-fail-count"
                    title={`${fails} failed`}
                    aria-label={`${fails} failed invocation${fails !== 1 ? "s" : ""}`}
                  >
                    {fails}✗
                  </span>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
