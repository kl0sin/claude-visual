import { useState, useEffect } from "react";
import type { AlertSettings } from "../hooks/useNotifications";
import {
  requestNotificationPermission,
  getNotificationPermission,
} from "../hooks/useNotifications";

interface AlertSettingsModalProps {
  settings: AlertSettings;
  onUpdate: (updates: Partial<AlertSettings>) => void;
  onClose: () => void;
}

function PermissionButton() {
  const [permission, setPermission] = useState<NotificationPermission>(
    getNotificationPermission,
  );

  useEffect(() => {
    setPermission(getNotificationPermission());
  }, []);

  const handleRequest = async () => {
    const result = await requestNotificationPermission();
    setPermission(result);
  };

  if (permission === "granted") {
    return (
      <div className="alert-permission-granted">
        <span className="alert-permission-dot" />
        Desktop notifications enabled
      </div>
    );
  }

  if (permission === "denied") {
    return (
      <div className="alert-permission-denied">
        ⚠ Desktop notifications blocked — enable in browser settings
      </div>
    );
  }

  return (
    <button className="alert-permission-btn" onClick={handleRequest}>
      Enable desktop notifications
    </button>
  );
}

interface ToggleRowProps {
  label: string;
  description: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}

function ToggleRow({ label, description, checked, onChange, disabled }: ToggleRowProps) {
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

interface ThresholdRowProps {
  label: string;
  description: string;
  value: number;
  min: number;
  step: number;
  unit: string;
  onChange: (v: number) => void;
  disabled?: boolean;
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
}: ThresholdRowProps) {
  return (
    <div className={`alert-threshold-row ${disabled ? "disabled" : ""}`}>
      <div className="alert-toggle-info">
        <span className="alert-toggle-label">{label}</span>
        <span className="alert-toggle-desc">
          {description} — set 0 to disable
        </span>
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

export function AlertSettingsModal({
  settings,
  onUpdate,
  onClose,
}: AlertSettingsModalProps) {
  const disabled = !settings.enabled;

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-label="Alert settings"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-header">
          <span className="modal-title">ALERT SETTINGS</span>
          <button className="modal-close" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>

        <div className="modal-body">
          {/* Master switch */}
          <ToggleRow
            label="Alerts enabled"
            description="Master switch for all notifications"
            checked={settings.enabled}
            onChange={(v) => onUpdate({ enabled: v })}
          />

          <div className="modal-divider" />

          {/* Desktop permission */}
          <div className="alert-section-label">Desktop notifications</div>
          <PermissionButton />

          <div className="modal-divider" />

          {/* Event triggers */}
          <div className="alert-section-label">Event triggers</div>

          <ToggleRow
            label="Tool failures"
            description="PostToolUseFailure events"
            checked={settings.toolFailures}
            onChange={(v) => onUpdate({ toolFailures: v })}
            disabled={disabled}
          />

          <ToggleRow
            label="Permission requests"
            description="PermissionRequest events"
            checked={settings.permissionRequests}
            onChange={(v) => onUpdate({ permissionRequests: v })}
            disabled={disabled}
          />

          <ToggleRow
            label="Session complete"
            description="SessionEnd events"
            checked={settings.sessionComplete}
            onChange={(v) => onUpdate({ sessionComplete: v })}
            disabled={disabled}
          />

          <div className="modal-divider" />

          {/* Thresholds */}
          <div className="alert-section-label">Thresholds</div>

          <ThresholdRow
            label="Cost threshold"
            description="Notify when total session cost exceeds this amount"
            value={settings.costThreshold}
            min={0}
            step={0.5}
            unit="$"
            onChange={(v) => onUpdate({ costThreshold: v })}
            disabled={disabled}
          />

          <ThresholdRow
            label="Session duration"
            description="Notify when a session runs longer than this"
            value={settings.sessionDurationMins}
            min={0}
            step={5}
            unit="min"
            onChange={(v) => onUpdate({ sessionDurationMins: v })}
            disabled={disabled}
          />
        </div>
      </div>
    </div>
  );
}
