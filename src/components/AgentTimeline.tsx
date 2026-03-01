import { useEffect, useState, useMemo } from "react";
import type { AgentProcess, ClaudeEvent } from "../types";

interface AgentTimelineProps {
  agents: AgentProcess[];
  events: ClaudeEvent[];
}

const AGENT_COLORS: Record<string, string> = {
  Explore: "#00f0ff",
  Plan: "#ff2d95",
  "general-purpose": "#f0ff00",
  "claude-code-guide": "#00ff9f",
  "test-runner": "#ffaa00",
  "build-validator": "#8b5cf6",
  session: "#8892a8",
};

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
  WebSearch: "#ff0040",
  WebFetch: "#ff0040",
};

type ToolAction = {
  id: string;
  tool: string;
  startTime: number;
  endTime?: number;
  status: "running" | "done" | "failed";
};

function computeToolActions(events: ClaudeEvent[]): ToolAction[] {
  const pending: ClaudeEvent[] = [];
  const pairs: ToolAction[] = [];

  for (const e of events) {
    if (e.type === "PreToolUse" && e.toolName) {
      pending.push(e);
    } else if (
      (e.type === "PostToolUse" || e.type === "PostToolUseFailure") &&
      e.toolName
    ) {
      const idx = pending.findIndex((p) => p.toolName === e.toolName);
      if (idx >= 0) {
        const pre = pending.splice(idx, 1)[0]!;
        pairs.push({
          id: pre.id,
          tool: e.toolName,
          startTime: pre.timestamp,
          endTime: e.timestamp,
          status: e.type === "PostToolUseFailure" ? "failed" : "done",
        });
      }
    }
  }

  for (const pre of pending) {
    pairs.push({
      id: pre.id,
      tool: pre.toolName!,
      startTime: pre.timestamp,
      status: "running",
    });
  }

  return pairs;
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${(ms / 60000).toFixed(1)}m`;
}

function formatAgentType(type: string): string {
  if (!type || type === "unknown") return "agent";
  return type;
}

export function AgentTimeline({ agents, events }: AgentTimelineProps) {
  const [now, setNow] = useState(Date.now());
  const activeAgents = agents.filter((a) => a.status === "active");
  const completedAgents = agents.filter((a) => a.status === "completed").slice(-15);

  useEffect(() => {
    if (activeAgents.length === 0) return;
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, [activeAgents.length]);

  // Pair PreToolUse → PostToolUse for each active agent's session
  const actionsBySession = useMemo(() => {
    const map = new Map<string, ToolAction[]>();
    const sessionIds = new Set(
      agents
        .filter((a) => a.status === "active")
        .map((a) => a.sessionId)
        .filter(Boolean) as string[]
    );
    for (const sid of sessionIds) {
      map.set(sid, computeToolActions(events.filter((e) => e.sessionId === sid)));
    }
    return map;
  }, [agents, events]);

  const totalCount = activeAgents.length + completedAgents.length;

  return (
    <div className="panel agent-timeline">
      <div className="panel-header">
        <div className="flex gap-2 items-center">
          <span className="panel-icon">◈</span>
          AGENT PROCESSES
          {totalCount > 0 && <span className="panel-count">({totalCount})</span>}
        </div>
        {activeAgents.length > 0 && (
          <span className="panel-badge pulse">{activeAgents.length} ACTIVE</span>
        )}
      </div>

      <div className="agent-list">
        {agents.length === 0 ? (
          <div className="agent-empty">NO AGENTS DEPLOYED</div>
        ) : (
          <>
            {activeAgents.map((agent) => {
              const type = formatAgentType(agent.type);
              const color = AGENT_COLORS[agent.type] ?? AGENT_COLORS[type] ?? "#00f0ff";
              const elapsed = now - agent.startTime;
              const actions = (agent.sessionId ? actionsBySession.get(agent.sessionId) : undefined) ?? [];
              const recent = actions.slice(-5);
              const maxDur = Math.max(...recent.map((a) => (a.endTime ? a.endTime - a.startTime : 0)), 500);

              return (
                <div
                  key={agent.id}
                  className="agent-card active"
                  style={{ "--agent-color": color } as React.CSSProperties}
                >
                  <div className="agent-card-header">
                    <span className="agent-status-indicator pulse" style={{ background: color }} />
                    <span className="agent-type">{type}</span>
                    <span className="agent-elapsed">{formatDuration(elapsed)}</span>
                  </div>
                  {agent.description && (
                    <div className="agent-description" title={agent.description}>{agent.description}</div>
                  )}

                  {recent.length > 0 ? (
                    <div className="agent-actions">
                      {recent.map((action) => {
                        const toolColor = TOOL_COLORS[action.tool] ?? "#8892a8";
                        const dur = action.endTime
                          ? action.endTime - action.startTime
                          : now - action.startTime;
                        const barPct =
                          action.status === "running"
                            ? 100
                            : Math.max(4, Math.min(100, (dur / maxDur) * 100));

                        return (
                          <div
                            key={action.id}
                            className={`agent-action agent-action-${action.status}`}
                          >
                            <span className="agent-action-icon">
                              {action.status === "running"
                                ? "●"
                                : action.status === "failed"
                                ? "✗"
                                : "✓"}
                            </span>
                            <span className="agent-action-name" style={{ color: toolColor }}>
                              {action.tool}
                            </span>
                            <div className="agent-action-bar">
                              <div
                                className={`agent-action-fill${action.status === "running" ? " scanning" : ""}`}
                                style={
                                  action.status === "running"
                                    ? { background: toolColor, boxShadow: `0 0 5px ${toolColor}88` }
                                    : {
                                        width: `${barPct}%`,
                                        background:
                                          action.status === "failed"
                                            ? "var(--color-cyber-red)"
                                            : `${toolColor}99`,
                                      }
                                }
                              />
                            </div>
                            <span className="agent-action-dur">
                              {formatDuration(
                                action.status === "running" ? dur : (action.endTime ? action.endTime - action.startTime : 0)
                              )}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="agent-progress-bar">
                      <div className="agent-progress-fill scanning" style={{ background: color }} />
                    </div>
                  )}
                </div>
              );
            })}

            {completedAgents.length > 0 && (
              <div className="agent-section-label">
                {activeAgents.length > 0 ? "COMPLETED" : "RECENT"}
              </div>
            )}

            {completedAgents.map((agent) => {
              const type = formatAgentType(agent.type);
              const color = AGENT_COLORS[agent.type] ?? AGENT_COLORS[type] ?? "#00f0ff";
              const duration = agent.endTime ? agent.endTime - agent.startTime : 0;

              return (
                <div
                  key={agent.id}
                  className="agent-card completed"
                  style={{ "--agent-color": color } as React.CSSProperties}
                >
                  <div className="agent-card-header">
                    <span
                      className="agent-status-indicator"
                      style={{ background: color, opacity: 0.4 }}
                    />
                    <span className="agent-type">{type}</span>
                    <span className="agent-duration">
                      {duration > 0 ? formatDuration(duration) : "—"}
                    </span>
                  </div>
                  {agent.description && (
                    <div className="agent-description" title={agent.description}>{agent.description}</div>
                  )}
                </div>
              );
            })}
          </>
        )}
      </div>
    </div>
  );
}
