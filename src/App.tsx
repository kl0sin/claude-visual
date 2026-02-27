import { useEffect, useState } from "react";
import { Header } from "./components/Header";
import { EventFeed } from "./components/EventFeed";
import { AgentTimeline } from "./components/AgentTimeline";
import { ToolStats } from "./components/ToolStats";
import { StatsPanel } from "./components/StatsPanel";
import { TokenPanel } from "./components/TokenPanel";
import { SessionSelector } from "./components/SessionSelector";
import { HookInstallBanner } from "./components/HookInstallBanner";
import { HistoryBrowser } from "./components/HistoryBrowser";
import { useWebSocket } from "./hooks/useWebSocket";
import { useRouter } from "./hooks/useRouter";

const WS_URL = (window as any).__TAURI__
  ? "ws://localhost:3200/ws"
  : `ws://${window.location.host}/ws`;

const API_BASE = (window as any).__TAURI__ ? "http://localhost:3200" : "";

const DEFAULT_TOKENS = {
  inputTokens: 0,
  outputTokens: 0,
  cacheCreationTokens: 0,
  cacheReadTokens: 0,
  totalTokens: 0,
};

export default function App() {
  const {
    events,
    stats,
    globalStats,
    sessions,
    selectedSession,
    setSelectedSession,
    connected,
    clearEvents,
  } = useWebSocket(WS_URL);

  const { route, navigate } = useRouter();
  const mode = route.mode;

  const [hooksInstalled, setHooksInstalled] = useState<boolean | null>(null);

  const checkHookStatus = () => {
    fetch(`${API_BASE}/api/hooks/status`)
      .then((r) => r.json())
      .then((data: { installed: boolean }) => setHooksInstalled(data.installed))
      .catch(() => setHooksInstalled(false));
  };

  useEffect(() => {
    checkHookStatus();
  }, []);

  return (
    <div className="app">
      <div className="scanlines" />

      <Header
        connected={connected}
        totalEvents={globalStats?.totalEvents || 0}
        totalTokens={globalStats?.tokens.totalTokens || 0}
        pendingTools={globalStats?.pendingTools || []}
        isProcessing={sessions.some((s) => s.isProcessing)}
        onClear={clearEvents}
        mode={mode}
        onModeChange={(m) => navigate({ mode: m })}
      />

      {mode === "live" ? (
        <>
          {hooksInstalled === false && (
            <HookInstallBanner onInstalled={checkHookStatus} />
          )}

          {sessions.length > 0 && (
            <SessionSelector
              sessions={sessions}
              selectedSession={selectedSession}
              onSelect={setSelectedSession}
            />
          )}

          <main className="dashboard">
            <div className="dashboard-left">
              <AgentTimeline agents={stats?.activeAgents || []} />
              <ToolStats toolCounts={stats?.toolCounts || {}} toolFailCounts={stats?.toolFailCounts || {}} />
            </div>

            <div className="dashboard-center">
              <EventFeed events={events} />
            </div>

            <div className="dashboard-right">
              <TokenPanel tokens={stats?.tokens || DEFAULT_TOKENS} model={stats?.model} />
              <StatsPanel stats={stats} events={events} />
            </div>
          </main>
        </>
      ) : (
        <HistoryBrowser
          projectId={route.projectId}
          sessionId={route.sessionId}
          onNavigate={(projectId, sessionId) =>
            navigate({ mode: "history", projectId, sessionId })
          }
        />
      )}

      <footer className="footer">
        <span className="footer-text">
          CLAUDE VISUAL // NEURAL MONITOR // {new Date().getFullYear()}
        </span>
        <span className="footer-separator">|</span>
        <span className="footer-text">
          {mode === "live"
            ? connected ? "◉ SYSTEM ONLINE" : "◎ AWAITING CONNECTION"
            : "◉ HISTORY MODE"}
        </span>
      </footer>
    </div>
  );
}
