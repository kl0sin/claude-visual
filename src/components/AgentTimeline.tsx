import { useEffect, useState } from "react";
import type { AgentProcess } from "../types";

interface AgentTimelineProps {
  agents: AgentProcess[];
}

const AGENT_COLORS: Record<string, string> = {
  Explore: "#00f0ff",
  Plan: "#ff2d95",
  "general-purpose": "#f0ff00",
  "claude-code-guide": "#00ff9f",
  "test-runner": "#ffaa00",
  "build-validator": "#8b5cf6",
};

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${(ms / 60000).toFixed(1)}m`;
}

function formatAgentType(type: string): string {
  if (!type || type === "unknown") return "agent";
  return type;
}

export function AgentTimeline({ agents }: AgentTimelineProps) {
  const [now, setNow] = useState(Date.now());
  const activeAgents = agents.filter((a) => a.status === "active");
  const completedAgents = agents
    .filter((a) => a.status === "completed")
    .slice(-20);

  // Tick every second to update elapsed times for active agents
  useEffect(() => {
    if (activeAgents.length === 0) return;
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, [activeAgents.length]);

  const totalCount = activeAgents.length + completedAgents.length;

  return (
    <div className="panel agent-timeline">
      <div className="panel-header">
        <div>
          <span className="panel-icon">◈</span>
          AGENT PROCESSES
          {totalCount > 0 && (
            <span className="panel-count">({totalCount})</span>
          )}
        </div>

        {activeAgents.length > 0 && (
          <span className="panel-badge pulse">
            {activeAgents.length} ACTIVE
          </span>
        )}
      </div>
      <div className="agent-list">
        {agents.length === 0 ? (
          <div className="agent-empty">No agents deployed</div>
        ) : (
          <>
            {activeAgents.map((agent) => {
              const type = formatAgentType(agent.type);
              const color =
                AGENT_COLORS[agent.type] || AGENT_COLORS[type] || "#00f0ff";
              const elapsed = now - agent.startTime;

              return (
                <div
                  key={agent.id}
                  className="agent-card active"
                  style={{ "--agent-color": color } as React.CSSProperties}
                >
                  <div className="agent-card-header">
                    <span
                      className="agent-status-indicator pulse"
                      style={{ background: color }}
                    />
                    <span className="agent-type">{type}</span>
                    <span className="agent-elapsed">
                      {formatDuration(elapsed)}
                    </span>
                  </div>
                  {agent.description && (
                    <div className="agent-description">{agent.description}</div>
                  )}
                  <div className="agent-progress-bar">
                    <div
                      className="agent-progress-fill scanning"
                      style={{ background: color }}
                    />
                  </div>
                </div>
              );
            })}

            {completedAgents.map((agent) => {
              const type = formatAgentType(agent.type);
              const color =
                AGENT_COLORS[agent.type] || AGENT_COLORS[type] || "#00f0ff";
              const duration = agent.endTime
                ? agent.endTime - agent.startTime
                : 0;

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
                    <div className="agent-description">{agent.description}</div>
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
