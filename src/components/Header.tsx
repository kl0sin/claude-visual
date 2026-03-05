import { useEffect, useRef, useState } from "react";
import type { PendingTool } from "../types";

interface HeaderProps {
  connected: boolean;
  totalEvents: number;
  totalTokens: number;
  pendingTools: PendingTool[];
  isProcessing: boolean;
  onClear: () => void;
  mode: "live" | "history" | "settings" | "replay";
  onModeChange: (mode: "live" | "history" | "settings") => void;
  isRemoteServer: boolean;
  hasAlerts: boolean;
}

function formatTokens(n: number): string {
  if (n === 0) return "0";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toLocaleString();
}

export function Header({
  connected,
  totalEvents,
  totalTokens,
  pendingTools,
  isProcessing,
  onClear,
  mode,
  onModeChange,
  isRemoteServer,
  hasAlerts,
}: HeaderProps) {
  const [glitch, setGlitch] = useState(false);
  const glitchTimeout = useRef<ReturnType<typeof setTimeout>>(undefined);
  const [bannerVisible, setBannerVisible] = useState(false);

  useEffect(() => {
    const interval = setInterval(
      () => {
        setGlitch(true);
        glitchTimeout.current = setTimeout(() => setGlitch(false), 150);
      },
      4000 + Math.random() * 3000,
    );
    return () => {
      clearInterval(interval);
      clearTimeout(glitchTimeout.current);
    };
  }, []);

  useEffect(() => {
    if (pendingTools.length === 0) {
      setBannerVisible(false);
      return;
    }
    const STALL_THRESHOLD = 15_000;
    const check = () => {
      const now = Date.now();
      const stalled = pendingTools.some((p) => now - p.since >= STALL_THRESHOLD);
      setBannerVisible(stalled);
    };
    check();
    const interval = setInterval(check, 2000);
    return () => clearInterval(interval);
  }, [pendingTools]);

  const toolNames = pendingTools.map((p) => p.tool).join(", ");

  // Dot indicators on the gear: remote server or alerts enabled
  const gearDot = isRemoteServer || hasAlerts;

  return (
    <header className="header">
      {bannerVisible && pendingTools.length > 0 && (
        <div className="attention-banner" role="alert" aria-live="assertive">
          <span className="attention-icon" aria-hidden="true">
            &#9888;
          </span>
          <span className="attention-text">AWAITING ACTION — {toolNames}</span>
        </div>
      )}

      <div className="header-left">
        <img src="/icon.png" alt="" className="header-logo" aria-hidden="true" />
        <h1 className={`header-title ${glitch ? "glitch" : ""}`}>
          <span className="header-title-main">CLAUDE</span>
          <span className="header-title-accent">VISUAL</span>
        </h1>
        <span className="header-subtitle">// NEURAL MONITOR v0.3.0</span>

        <div className="mode-toggle">
          <button
            className={`mode-btn ${mode === "live" ? "active" : ""}`}
            aria-pressed={mode === "live"}
            onClick={() => onModeChange("live")}
          >
            <span className="mode-btn-dot" />
            LIVE
          </button>
          <button
            className={`mode-btn ${mode === "history" ? "active" : ""}`}
            aria-pressed={mode === "history"}
            onClick={() => onModeChange("history")}
          >
            SESSIONS
          </button>
        </div>
      </div>

      <div className="header-right">
        <div className="header-stats">
          <span className="header-stat">
            <span className="stat-label">EVENTS</span>
            <span className="stat-value cyan">{totalEvents}</span>
          </span>
          <span className="header-stat-divider" />
          <span className="header-stat">
            <span className="stat-label">TOKENS</span>
            <span className="stat-value magenta">{formatTokens(totalTokens)}</span>
          </span>
        </div>

        <button className="btn-clear" onClick={onClear} title="Clear all events">
          PURGE
        </button>

        <button
          className={`btn-settings ${mode === "settings" ? "active" : ""}`}
          onClick={() => onModeChange(mode === "settings" ? "live" : "settings")}
          title="Settings"
          aria-label="Settings"
          aria-pressed={mode === "settings"}
        >
          <span className="btn-settings-icon">⚙</span>
          {gearDot && <span className="btn-settings-dot" aria-hidden="true" />}
        </button>

        <div
          className={`connection-status ${!connected ? "offline" : isProcessing ? "processing" : "online"}`}
          role="status"
          aria-live="polite"
        >
          <span className="status-dot" aria-hidden="true" />
          <span className="status-text">
            {!connected ? "OFFLINE" : isProcessing ? "PROCESSING" : "LINKED"}
          </span>
        </div>
      </div>
    </header>
  );
}
