import { useEffect, useState } from "react";
import { Header } from "./components/Header";
import { EventFeed } from "./components/EventFeed";
import { AgentTimeline } from "./components/AgentTimeline";
import { ToolStats } from "./components/ToolStats";
import { StatsPanel } from "./components/StatsPanel";
import { TokenPanel } from "./components/TokenPanel";
import { SessionSelector } from "./components/SessionSelector";
import { HookInstallBanner } from "./components/HookInstallBanner";
import { SessionViewer } from "./components/SessionViewer";
import { SettingsPage } from "./components/SettingsPage";
import { ToastContainer } from "./components/ToastContainer";
import { TooltipOverlay } from "./components/TooltipOverlay";
import { useWebSocket } from "./hooks/useWebSocket";
import { useRouter } from "./hooks/useRouter";
import { useNotifications } from "./hooks/useNotifications";
import { useServerConfig } from "./hooks/useServerConfig";

const DEFAULT_TOKENS = {
  inputTokens: 0,
  outputTokens: 0,
  cacheCreationTokens: 0,
  cacheReadTokens: 0,
  totalTokens: 0,
};

export default function App() {
  const { activeId: activeServerId, wsUrl, apiBase, authHeaders } = useServerConfig();

  const {
    events,
    allEvents,
    stats,
    globalStats,
    sessions,
    selectedSession,
    setSelectedSession,
    connected,
    clearEvents,
    truncated,
  } = useWebSocket(wsUrl, apiBase, authHeaders);

  const { route, navigate } = useRouter();
  const mode = route.mode;

  const [hooksInstalled, setHooksInstalled] = useState<boolean | null>(null);

  const {
    toasts,
    dismissToast,
    settings: alertSettings,
    updateSettings: updateAlertSettings,
  } = useNotifications(allEvents, globalStats, sessions);

  const checkHookStatus = () => {
    fetch(`${apiBase}/api/hooks/status`, { headers: authHeaders })
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
        isRemoteServer={activeServerId !== "local"}
        hasAlerts={alertSettings.enabled}
      />

      {mode === "live" && (
        <>
          {hooksInstalled === false && (
            <HookInstallBanner
              onInstalled={checkHookStatus}
              apiBase={apiBase}
              authHeaders={authHeaders}
            />
          )}

          {sessions.length > 0 && (
            <SessionSelector
              sessions={sessions}
              selectedSession={selectedSession}
              onSelect={setSelectedSession}
            />
          )}

          <main className="dashboard" aria-label="Live monitoring dashboard">
            <div className="dashboard-left">
              <AgentTimeline agents={stats?.activeAgents || []} events={events} />
              <ToolStats
                toolCounts={stats?.toolCounts || {}}
                toolFailCounts={stats?.toolFailCounts || {}}
              />
            </div>

            <div className="dashboard-center">
              <EventFeed
                events={events}
                truncated={truncated}
                isProcessing={
                  selectedSession
                    ? (sessions.find((s) => s.id === selectedSession)?.isProcessing ?? false)
                    : sessions.some((s) => s.isProcessing)
                }
                pendingTools={stats?.pendingTools}
              />
            </div>

            <div className="dashboard-right">
              <TokenPanel tokens={stats?.tokens || DEFAULT_TOKENS} model={stats?.model} />
              <StatsPanel stats={stats} events={events} />
            </div>
          </main>
        </>
      )}

      {mode === "history" && (
        <SessionViewer
          projectId={"projectId" in route ? route.projectId : undefined}
          sessionId={"sessionId" in route ? route.sessionId : undefined}
          onNavigate={(projectId, sessionId) => navigate({ mode: "history", projectId, sessionId })}
          apiBase={apiBase}
          authHeaders={authHeaders}
        />
      )}

      {mode === "settings" && (
        <SettingsPage alertSettings={alertSettings} onUpdateAlerts={updateAlertSettings} />
      )}

      <ToastContainer toasts={toasts} onDismiss={dismissToast} />
      <TooltipOverlay />

      <footer className="footer">
        <span className="footer-text">
          CLAUDE VISUAL // NEURAL MONITOR // {new Date().getFullYear()}
        </span>
        <span className="footer-separator">|</span>
        <span className="footer-text">
          {mode === "live"
            ? connected
              ? "◉ SYSTEM ONLINE"
              : "◎ AWAITING CONNECTION"
            : mode === "settings"
              ? "◈ SETTINGS"
              : "◉ SESSIONS"}
        </span>
      </footer>
    </div>
  );
}
