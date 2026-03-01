import { useState, useCallback } from "react";
import type { AlertSettings } from "../hooks/useNotifications";
import {
  requestNotificationPermission,
  getNotificationPermission,
} from "../hooks/useNotifications";
import { useServerConfig } from "../hooks/useServerConfig";
import type { ServerInstance } from "../hooks/useServerConfig";

const LOCAL_ID = "local";

// ── Servers section ──────────────────────────────────────────

function ServerCard({
  server,
  isActive,
  apiBase,
  authHeaders,
  onSelect,
  onRemove,
}: {
  server: ServerInstance;
  isActive: boolean;
  apiBase: string;
  authHeaders: Record<string, string>;
  onSelect: (id: string) => void;
  onRemove: (id: string) => void;
}) {
  const [testState, setTestState] = useState<"idle" | "checking" | "ok" | "error">("idle");

  const test = useCallback(async () => {
    setTestState("checking");
    try {
      const base = server.id === LOCAL_ID ? apiBase : server.url;
      const hdrs =
        server.id === LOCAL_ID
          ? authHeaders
          : server.token
            ? { Authorization: `Bearer ${server.token}` }
            : {};
      const r = await fetch(`${base}/api/health`, {
        headers: hdrs,
        signal: AbortSignal.timeout(4000),
      });
      setTestState(r.ok ? "ok" : "error");
    } catch {
      setTestState("error");
    }
    setTimeout(() => setTestState("idle"), 4000);
  }, [server, apiBase, authHeaders]);

  return (
    <div className={`settings-server-card ${isActive ? "active" : ""}`}>
      <div className="settings-server-card-info">
        {isActive && <span className="server-active-dot" aria-hidden="true" />}
        <div className="server-row-text">
          <span className="server-row-name">{server.name}</span>
          <span className="server-row-url">{server.url}</span>
          {server.token && <span className="server-row-token">auth: ••••••••</span>}
        </div>
      </div>
      <div className="server-row-actions">
        {testState === "ok"    && <span className="server-test-ok">OK</span>}
        {testState === "error" && <span className="server-test-err">FAIL</span>}
        <button
          className="server-action-btn"
          onClick={test}
          disabled={testState === "checking"}
        >
          {testState === "checking" ? "…" : "TEST"}
        </button>
        {!isActive && (
          <button
            className="server-action-btn primary"
            onClick={() => onSelect(server.id)}
          >
            CONNECT
          </button>
        )}
        {server.id !== LOCAL_ID && (
          <button
            className="server-action-btn danger"
            onClick={() => onRemove(server.id)}
            aria-label="Remove server"
          >
            ✕
          </button>
        )}
      </div>
    </div>
  );
}

function AddServerForm({ onAdd }: { onAdd: (s: Omit<ServerInstance, "id">) => void }) {
  const [name, setName] = useState("");
  const [url, setUrl]   = useState("http://");
  const [token, setToken] = useState("");
  const [error, setError] = useState("");

  const submit = () => {
    setError("");
    const trimmedUrl = url.trim().replace(/\/$/, "");
    if (!name.trim()) { setError("Name is required"); return; }
    try { new URL(trimmedUrl); } catch {
      setError("Enter a valid URL, e.g. http://192.168.1.5:3200");
      return;
    }
    onAdd({ name: name.trim(), url: trimmedUrl, token: token.trim() || undefined });
    setName(""); setUrl("http://"); setToken("");
  };

  return (
    <div className="settings-add-server">
      <div className="settings-section-label">Add server</div>
      <div className="add-server-fields">
        <div className="add-server-field">
          <label className="add-server-label">Name</label>
          <input className="add-server-input" placeholder="e.g. Work laptop" value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="add-server-field">
          <label className="add-server-label">URL</label>
          <input className="add-server-input" placeholder="http://192.168.1.5:3200" value={url} onChange={(e) => setUrl(e.target.value)} />
        </div>
        <div className="add-server-field">
          <label className="add-server-label">
            Auth token <span className="add-server-optional">(optional)</span>
          </label>
          <input
            className="add-server-input"
            type="password"
            placeholder="Set CLAUDE_VISUAL_TOKEN on the remote server"
            value={token}
            onChange={(e) => setToken(e.target.value)}
          />
        </div>
      </div>
      {error && <div className="add-server-error">{error}</div>}
      <button className="add-server-btn" onClick={submit}>ADD SERVER</button>
      <p className="settings-hint">
        To enable remote access on a server set <code>CLAUDE_VISUAL_TOKEN</code> before starting Claude Visual.
      </p>
    </div>
  );
}

function ServersSection() {
  const { servers, activeId, apiBase, authHeaders, selectServer, addServer, removeServer } =
    useServerConfig();

  return (
    <div className="settings-section">
      <div className="settings-section-label">Connected instances</div>
      <div className="settings-server-list">
        {servers.map((s) => (
          <ServerCard
            key={s.id}
            server={s}
            isActive={s.id === activeId}
            apiBase={apiBase}
            authHeaders={authHeaders}
            onSelect={selectServer}
            onRemove={removeServer}
          />
        ))}
      </div>
      <div className="settings-divider" />
      <AddServerForm onAdd={addServer} />
    </div>
  );
}

// ── Alerts section ───────────────────────────────────────────

function PermissionRow() {
  const [perm, setPerm] = useState<NotificationPermission>(getNotificationPermission);

  const request = async () => {
    const result = await requestNotificationPermission();
    setPerm(result);
  };

  if (perm === "granted") {
    return (
      <div className="alert-permission-granted">
        <span className="alert-permission-dot" />
        Desktop notifications enabled
      </div>
    );
  }
  if (perm === "denied") {
    return (
      <div className="alert-permission-denied">
        ⚠ Desktop notifications blocked — enable in browser/OS settings
      </div>
    );
  }
  return (
    <button className="alert-permission-btn" onClick={request}>
      Enable desktop notifications
    </button>
  );
}

interface AlertsSectionProps {
  settings: AlertSettings;
  onUpdate: (updates: Partial<AlertSettings>) => void;
}

function ToggleRow({
  label,
  description,
  checked,
  onChange,
  disabled,
}: {
  label: string;
  description: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <label className={`alert-toggle-row ${disabled ? "disabled" : ""}`}>
      <div className="alert-toggle-info">
        <span className="alert-toggle-label">{label}</span>
        <span className="alert-toggle-desc">{description}</span>
      </div>
      <button
        role="switch"
        aria-checked={checked}
        aria-label={label}
        disabled={disabled}
        className={`alert-toggle ${checked ? "on" : "off"}`}
        onClick={() => onChange(!checked)}
      >
        <span className="alert-toggle-thumb" />
      </button>
    </label>
  );
}

function ThresholdRow({
  label,
  description,
  value,
  min,
  step,
  unit,
  onChange,
  disabled,
}: {
  label: string;
  description: string;
  value: number;
  min: number;
  step: number;
  unit: string;
  onChange: (v: number) => void;
  disabled?: boolean;
}) {
  return (
    <div className={`alert-threshold-row ${disabled ? "disabled" : ""}`}>
      <div className="alert-toggle-info">
        <span className="alert-toggle-label">{label}</span>
        <span className="alert-toggle-desc">{description} — set 0 to disable</span>
      </div>
      <div className="alert-threshold-input-wrap">
        <span className="alert-threshold-unit">{unit}</span>
        <input
          type="number"
          className="alert-threshold-input"
          value={value}
          min={min}
          step={step}
          disabled={disabled}
          onChange={(e) => onChange(Math.max(min, parseFloat(e.target.value) || 0))}
        />
      </div>
    </div>
  );
}

function AlertsSection({ settings, onUpdate }: AlertsSectionProps) {
  const off = !settings.enabled;
  return (
    <div className="settings-section">
      <ToggleRow
        label="Alerts enabled"
        description="Master switch for all notifications"
        checked={settings.enabled}
        onChange={(v) => onUpdate({ enabled: v })}
      />

      <div className="settings-divider" />
      <div className="settings-section-label">Desktop notifications</div>
      <PermissionRow />

      <div className="settings-divider" />
      <div className="settings-section-label">Event triggers</div>

      <ToggleRow
        label="Tool failures"
        description="PostToolUseFailure events"
        checked={settings.toolFailures}
        onChange={(v) => onUpdate({ toolFailures: v })}
        disabled={off}
      />
      <ToggleRow
        label="Permission requests"
        description="PermissionRequest events"
        checked={settings.permissionRequests}
        onChange={(v) => onUpdate({ permissionRequests: v })}
        disabled={off}
      />
      <ToggleRow
        label="Session complete"
        description="SessionEnd events"
        checked={settings.sessionComplete}
        onChange={(v) => onUpdate({ sessionComplete: v })}
        disabled={off}
      />

      <div className="settings-divider" />
      <div className="settings-section-label">Thresholds</div>

      <ThresholdRow
        label="Cost threshold"
        description="Notify when total cost exceeds this amount"
        value={settings.costThreshold}
        min={0}
        step={0.5}
        unit="$"
        onChange={(v) => onUpdate({ costThreshold: v })}
        disabled={off}
      />
      <ThresholdRow
        label="Session duration"
        description="Notify when a session runs longer than this"
        value={settings.sessionDurationMins}
        min={0}
        step={5}
        unit="min"
        onChange={(v) => onUpdate({ sessionDurationMins: v })}
        disabled={off}
      />
    </div>
  );
}

// ── Main Settings Page ───────────────────────────────────────

type Tab = "servers" | "alerts";

const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: "servers", label: "Servers",  icon: "◈" },
  { id: "alerts",  label: "Alerts",   icon: "◆" },
];

interface SettingsPageProps {
  alertSettings: AlertSettings;
  onUpdateAlerts: (updates: Partial<AlertSettings>) => void;
}

export function SettingsPage({ alertSettings, onUpdateAlerts }: SettingsPageProps) {
  const [tab, setTab] = useState<Tab>("servers");

  return (
    <div className="settings-page" role="main" aria-label="Settings">
      <nav className="settings-sidebar" aria-label="Settings navigation">
        <div className="settings-sidebar-title">SETTINGS</div>
        {TABS.map((t) => (
          <button
            key={t.id}
            className={`settings-nav-item ${tab === t.id ? "active" : ""}`}
            onClick={() => setTab(t.id)}
            aria-current={tab === t.id ? "page" : undefined}
          >
            <span className="settings-nav-icon" aria-hidden="true">{t.icon}</span>
            {t.label}
          </button>
        ))}
      </nav>

      <div className="settings-content">
        {tab === "servers" && <ServersSection />}
        {tab === "alerts"  && <AlertsSection settings={alertSettings} onUpdate={onUpdateAlerts} />}
      </div>
    </div>
  );
}
