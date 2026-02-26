import { useEffect, useRef, useState } from "react";
import type { PendingTool } from "../types";

interface HeaderProps {
  connected: boolean;
  totalEvents: number;
  totalTokens: number;
  pendingTools: PendingTool[];
  onClear: () => void;
}

function formatTokens(n: number): string {
  if (n === 0) return "0";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toLocaleString();
}

export function Header({ connected, totalEvents, totalTokens, pendingTools, onClear }: HeaderProps) {
  const [glitch, setGlitch] = useState(false);
  const glitchTimeout = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => {
    const interval = setInterval(() => {
      setGlitch(true);
      glitchTimeout.current = setTimeout(() => setGlitch(false), 150);
    }, 4000 + Math.random() * 3000);
    return () => {
      clearInterval(interval);
      clearTimeout(glitchTimeout.current);
    };
  }, []);

  const toolNames = pendingTools.map((p) => p.tool).join(", ");

  return (
    <header className="header">
      {pendingTools.length > 0 && (
        <div className="attention-banner">
          <span className="attention-icon">&#9888;</span>
          <span className="attention-text">
            AWAITING ACTION — {toolNames}
          </span>
        </div>
      )}

      <div className="header-left">
        <h1 className={`header-title ${glitch ? "glitch" : ""}`}>
          <span className="header-title-main">CLAUDE</span>
          <span className="header-title-accent">VISUAL</span>
        </h1>
        <span className="header-subtitle">// NEURAL MONITOR v1.0</span>
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

        <div className={`connection-status ${connected ? "online" : "offline"}`}>
          <span className="status-dot" />
          <span className="status-text">
            {connected ? "LINKED" : "OFFLINE"}
          </span>
        </div>
      </div>
    </header>
  );
}
