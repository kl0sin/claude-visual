interface ToolStatsProps {
  toolCounts: Record<string, number>;
  toolFailCounts?: Record<string, number>;
}

/** Fallback color for all MCP tools */
const COLOR_MCP = "#e879f9";

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
  Agent: "#ffaa00",
  WebSearch: "#ff0040",
  WebFetch: "#ff0040",
};

function toolColor(tool: string): string {
  if (TOOL_COLORS[tool]) return TOOL_COLORS[tool];
  if (tool.startsWith("mcp__")) return COLOR_MCP;
  return "#8892a8";
}

function parseToolName(tool: string): { prefix: string | null; name: string } {
  if (tool.startsWith("mcp__")) {
    const rest = tool.slice(5);
    const sep = rest.indexOf("__");
    if (sep !== -1) {
      return { prefix: `mcp:${rest.slice(0, sep)}`, name: rest.slice(sep + 2) };
    }
    return { prefix: "mcp", name: rest };
  }
  return { prefix: null, name: tool };
}

export function ToolStats({ toolCounts, toolFailCounts = {} }: ToolStatsProps) {
  const sorted = Object.entries(toolCounts).sort((a, b) => b[1] - a[1]);
  const max = sorted[0]?.[1] || 1;

  return (
    <div className="panel tool-stats" role="region" aria-label="Tool Usage">
      <div className="panel-header">
        <span className="panel-icon" aria-hidden="true">
          ⚡
        </span>
        TOOL USAGE
      </div>
      <div className="tool-list">
        {sorted.length === 0 ? (
          <div className="tool-empty">No tools invoked</div>
        ) : (
          sorted.map(([tool, count]) => {
            const color = toolColor(tool);
            const fails = toolFailCounts[tool] || 0;
            const pct = (count / max) * 100;
            const { prefix, name } = parseToolName(tool);

            return (
              <div key={tool} className="tool-row">
                <span className="tool-name" style={{ color }} data-tooltip={tool}>
                  {prefix && <span className="tool-name-prefix">{prefix} · </span>}
                  {name}
                </span>
                <div className="tool-row-metrics">
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
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
