import { useEffect, useRef, useState } from "react";

interface AlertToast {
  title: string;
  body: string;
  color: string;
  icon: string;
}

const ALERTS: AlertToast[] = [
  {
    icon: "✕",
    color: "#ff0040",
    title: "TOOL FAILURE",
    body: "Bash → permission denied: /etc/hosts",
  },
  {
    icon: "⚠",
    color: "#f0ff00",
    title: "COST THRESHOLD",
    body: "Session cost exceeded $0.50 alert",
  },
  {
    icon: "⚡",
    color: "#00f0ff",
    title: "PERMISSION REQUEST",
    body: "Edit: src/auth/session.ts — awaiting approval",
  },
  {
    icon: "◉",
    color: "#00ff9f",
    title: "SESSION COMPLETE",
    body: "JWT refactor — 24.3K tokens · $0.031",
  },
  {
    icon: "✕",
    color: "#ff0040",
    title: "TOOL FAILURE",
    body: "Write → disk quota exceeded on /home",
  },
];

const SETTINGS = [
  { label: "Tool failures", color: "#ff0040" },
  { label: "Cost threshold: $0.50", color: "#f0ff00" },
  { label: "Permission requests", color: "#00f0ff" },
  { label: "Session end", color: "#00ff9f" },
  { label: "Duration: 5 min", color: "#ff6b00" },
];

interface ToastEntry extends AlertToast {
  id: number;
  exiting: boolean;
}

export function DemoAlerts() {
  const [toasts, setToasts] = useState<ToastEntry[]>([]);
  const indexRef = useRef(0);
  const counterRef = useRef(0);

  useEffect(() => {
    const addToast = () => {
      const alert = ALERTS[indexRef.current % ALERTS.length]!;
      indexRef.current++;
      const id = ++counterRef.current;

      setToasts((prev) => [...prev.slice(-3), { ...alert, id, exiting: false }]);

      setTimeout(() => {
        setToasts((prev) =>
          prev.map((t) => (t.id === id ? { ...t, exiting: true } : t)),
        );
        setTimeout(() => {
          setToasts((prev) => prev.filter((t) => t.id !== id));
        }, 400);
      }, 2800);
    };

    const initial = setTimeout(addToast, 400);
    const interval = setInterval(addToast, 2200);
    return () => {
      clearTimeout(initial);
      clearInterval(interval);
    };
  }, []);

  return (
    <div className="demo-terminal">
      <div className="demo-terminal-header">
        <div className="demo-terminal-title">
          <span style={{ color: "#ff0040" }}>◎</span>
          SMART ALERTS
        </div>
        <span className="demo-terminal-tag">SIMULATED</span>
      </div>

      <div className="demo-alerts-body">
        <div className="demo-alerts-settings">
          <p className="demo-alerts-settings-title">ALERT TRIGGERS</p>
          {SETTINGS.map((s) => (
            <div key={s.label} className="demo-alert-setting">
              <span
                className="demo-alert-setting-dot"
                style={{ background: s.color, boxShadow: `0 0 6px ${s.color}` }}
              />
              <span className="demo-alert-setting-label">{s.label}</span>
              <span className="demo-alert-setting-badge">ON</span>
            </div>
          ))}

          <div className="demo-alerts-divider" />

          <p className="demo-alerts-settings-title">CHANNELS</p>
          <div className="demo-alert-setting">
            <span className="demo-alert-channel-icon">🖥</span>
            <span className="demo-alert-setting-label">Desktop notification</span>
            <span className="demo-alert-setting-badge">ON</span>
          </div>
          <div className="demo-alert-setting">
            <span className="demo-alert-channel-icon">◈</span>
            <span className="demo-alert-setting-label">In-app toast</span>
            <span className="demo-alert-setting-badge">ON</span>
          </div>
        </div>

        <div className="demo-alerts-toasts-area">
          <div className="demo-alerts-live-label">
            <span className="demo-terminal-dot" />
            LIVE EVENTS
          </div>
          <div className="demo-alerts-toasts">
            {toasts.map((t) => (
              <div
                key={t.id}
                className={`demo-toast ${t.exiting ? "exiting" : ""}`}
                style={{ "--toast-color": t.color } as React.CSSProperties}
              >
                <span className="demo-toast-icon">{t.icon}</span>
                <div className="demo-toast-content">
                  <p className="demo-toast-title">{t.title}</p>
                  <p className="demo-toast-body">{t.body}</p>
                </div>
                <span className="demo-toast-dismiss">✕</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
