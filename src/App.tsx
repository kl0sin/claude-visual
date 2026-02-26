import { Header } from "./components/Header";
import { EventFeed } from "./components/EventFeed";
import { AgentTimeline } from "./components/AgentTimeline";
import { ToolStats } from "./components/ToolStats";
import { StatsPanel } from "./components/StatsPanel";
import { TokenPanel } from "./components/TokenPanel";
import { SessionSelector } from "./components/SessionSelector";
import { useWebSocket } from "./hooks/useWebSocket";

const WS_URL = `ws://${window.location.hostname}:3200/ws`;

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

  return (
    <div className="app">
      <div className="scanlines" />

      <Header
        connected={connected}
        totalEvents={globalStats?.totalEvents || 0}
        totalTokens={globalStats?.tokens.totalTokens || 0}
        onClear={clearEvents}
      />

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
          <ToolStats toolCounts={stats?.toolCounts || {}} />
        </div>

        <div className="dashboard-center">
          <EventFeed events={events} />
        </div>

        <div className="dashboard-right">
          <TokenPanel tokens={stats?.tokens || DEFAULT_TOKENS} />
          <StatsPanel stats={stats} />
        </div>
      </main>

      <footer className="footer">
        <span className="footer-text">
          CLAUDE VISUAL // NEURAL MONITOR // {new Date().getFullYear()}
        </span>
        <span className="footer-separator">|</span>
        <span className="footer-text">
          {connected ? "◉ SYSTEM ONLINE" : "◎ AWAITING CONNECTION"}
        </span>
      </footer>
    </div>
  );
}
