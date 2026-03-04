import { useMemo } from "react";
import { useReplaySession } from "../hooks/useReplaySession";
import type { ReplaySpeed } from "../hooks/useReplaySession";
import { ReplayControls } from "./ReplayControls";
import { EventFeed } from "./EventFeed";
import { AgentTimeline } from "./AgentTimeline";
import { ToolStats } from "./ToolStats";
import type { AgentProcess } from "../types";

interface ReplayViewerProps {
  sessionId: string;
  onBack: () => void;
  apiBase: string;
  authHeaders: Record<string, string>;
}

export function ReplayViewer({ sessionId, onBack, apiBase, authHeaders }: ReplayViewerProps) {
  const { visibleEvents, state, speed, progress, currentIndex, totalEvents, play, pause, setSpeed, seek, reset } =
    useReplaySession(sessionId, apiBase, authHeaders);

  // Derive tool counts from visible events
  const toolCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const e of visibleEvents) {
      if (e.toolName && (e.type === "PostToolUse" || e.type === "PreToolUse")) {
        counts[e.toolName] = (counts[e.toolName] ?? 0) + 1;
      }
    }
    return counts;
  }, [visibleEvents]);

  const toolFailCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const e of visibleEvents) {
      if (e.toolName && e.type === "PostToolUseFailure") {
        counts[e.toolName] = (counts[e.toolName] ?? 0) + 1;
      }
    }
    return counts;
  }, [visibleEvents]);

  // Derive agents from visible SubagentStart/Stop events
  const agents = useMemo(() => {
    const agentMap = new Map<string, AgentProcess>();
    for (const e of visibleEvents) {
      if (e.type === "SubagentStart") {
        const id: string = (e.data.agent_id as string | undefined) ?? e.id;
        agentMap.set(id, {
          id,
          type: e.agentType ?? "unknown",
          description: e.data.description as string | undefined,
          startTime: e.timestamp,
          status: "active",
          sessionId: e.sessionId,
        });
      } else if (e.type === "SubagentStop") {
        const id = e.data.agent_id as string | undefined;
        if (id) {
          const a = agentMap.get(id);
          if (a) {
            a.endTime = e.timestamp;
            a.status = "completed";
          }
        }
      }
    }
    return Array.from(agentMap.values());
  }, [visibleEvents]);

  return (
    <div className="replay-viewer">
      <ReplayControls
        state={state}
        speed={speed}
        progress={progress}
        currentIndex={currentIndex}
        totalEvents={totalEvents}
        sessionId={sessionId}
        onPlay={play}
        onPause={pause}
        onReset={reset}
        onSpeedChange={(s: ReplaySpeed) => setSpeed(s)}
        onSeek={seek}
        onBack={onBack}
      />

      <main className="dashboard" aria-label="Replay dashboard">
        <div className="dashboard-left">
          <AgentTimeline agents={agents} events={visibleEvents} />
          <ToolStats toolCounts={toolCounts} toolFailCounts={toolFailCounts} />
        </div>

        <div className="dashboard-center">
          <EventFeed events={visibleEvents} isProcessing={state === "playing"} />
        </div>

        <div className="dashboard-right replay-right-placeholder">
          <div className="panel">
            <div className="panel-header">
              <span className="panel-title">REPLAY</span>
            </div>
            <div className="replay-info-panel">
              <div className="replay-info-row">
                <span className="stat-label">STATUS</span>
                <span className={`stat-value replay-state-${state}`}>{state.toUpperCase()}</span>
              </div>
              <div className="replay-info-row">
                <span className="stat-label">SPEED</span>
                <span className="stat-value cyan">×{speed}</span>
              </div>
              <div className="replay-info-row">
                <span className="stat-label">EVENTS</span>
                <span className="stat-value magenta">
                  {currentIndex} / {totalEvents}
                </span>
              </div>
              <div className="replay-info-row">
                <span className="stat-label">PROGRESS</span>
                <span className="stat-value green">{Math.round(progress * 100)}%</span>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
