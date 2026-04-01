import { useState, useEffect, useRef, useCallback } from "react";
import type { ClaudeEvent, SessionStats, SessionInfo } from "../types";
import { computeCost } from "../../shared/tokens";

export interface AlertSettings {
  enabled: boolean;
  toolFailures: boolean;
  permissionRequests: boolean;
  permissionDenied: boolean;
  sessionComplete: boolean;
  costThreshold: number; // USD, 0 = disabled
  sessionDurationMins: number; // minutes, 0 = disabled
}

export interface Toast {
  id: string;
  title: string;
  body: string;
  color: string;
}

const STORAGE_KEY = "claude-visual:alerts";

const DEFAULTS: AlertSettings = {
  enabled: true,
  toolFailures: true,
  permissionRequests: true,
  permissionDenied: true,
  sessionComplete: false,
  costThreshold: 1.0,
  sessionDurationMins: 30,
};

export function loadAlertSettings(): AlertSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return { ...DEFAULTS, ...JSON.parse(raw) };
  } catch {}
  return { ...DEFAULTS };
}

function saveAlertSettings(s: AlertSettings): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
  } catch {}
}

let toastSeq = 0;

export function useNotifications(
  allEvents: ClaudeEvent[],
  globalStats: SessionStats | null,
  sessions: SessionInfo[],
) {
  const [settings, setSettings] = useState<AlertSettings>(loadAlertSettings);
  const [toasts, setToasts] = useState<Toast[]>([]);

  // Previous allEvents reference — diff against it to find truly new events
  const prevAllEventsRef = useRef<ClaudeEvent[]>([]);
  // true after first snapshot has been processed
  const initializedRef = useRef(false);
  // Cost level at which we last notified (multiple of threshold)
  const notifiedCostLevelRef = useRef(0);
  // Session IDs for which duration alert already fired
  const notifiedDurationRef = useRef<Set<string>>(new Set());

  const addToast = useCallback((title: string, body: string, color: string) => {
    const id = `toast-${++toastSeq}`;
    setToasts((prev) => [...prev.slice(-4), { id, title, body, color }]);
  }, []);

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const fireDesktop = useCallback((title: string, body: string) => {
    if (!("Notification" in window) || Notification.permission !== "granted") return;
    try {
      new Notification(title, { body, icon: "/icon.png", tag: title });
    } catch {}
  }, []);

  const notify = useCallback(
    (title: string, body: string, color: string) => {
      addToast(title, body, color);
      fireDesktop(title, body);
    },
    [addToast, fireDesktop],
  );

  // Process events — skip initial snapshot batch, notify for new events only
  useEffect(() => {
    if (!settings.enabled) return;

    const prev = prevAllEventsRef.current;
    prevAllEventsRef.current = allEvents;

    if (!initializedRef.current) {
      initializedRef.current = true;
      return;
    }

    // Only events not present in the previous array are truly new.
    // Using ID-based diff avoids the bounded-set eviction bug where old IDs
    // get dropped from a capped Set and re-trigger notifications.
    const prevIds = new Set(prev.map((e) => e.id));
    const newEvents = allEvents.filter((e) => !prevIds.has(e.id));

    if (newEvents.length === 0) return;

    for (const evt of newEvents) {
      if (settings.toolFailures && evt.type === "PostToolUseFailure") {
        const tool = evt.toolName ?? "unknown tool";
        const errorMsg = evt.data?.error ? `: ${String(evt.data.error).slice(0, 100)}` : "";
        notify("TOOL FAILURE", `${tool} failed${errorMsg}`, "#ff0040");
      }

      if (settings.permissionRequests && evt.type === "PermissionRequest") {
        const tool = evt.toolName ?? evt.data?.tool_name ?? "tool";
        notify("PERMISSION REQUIRED", `Awaiting permission for: ${tool}`, "#ff2d95");
      }

      if (settings.permissionDenied && evt.type === "PermissionDenied") {
        const tool = evt.toolName ?? evt.data?.tool_name ?? "tool";
        notify("PERMISSION DENIED", `Auto mode denied: ${tool}`, "#ff0040");
      }

      if (settings.sessionComplete && evt.type === "SessionEnd") {
        const sid = evt.sessionId ? evt.sessionId.slice(0, 8) + "…" : "session";
        notify("SESSION COMPLETE", `${sid} ended`, "#f0ff00");
      }
    }
  }, [allEvents, settings, notify]);

  // Cost threshold check
  useEffect(() => {
    if (!settings.enabled || settings.costThreshold <= 0 || !globalStats) return;

    const cost = computeCost(globalStats.tokens, globalStats.model);
    const level = Math.floor(cost / settings.costThreshold);
    if (level > 0 && level > notifiedCostLevelRef.current) {
      notifiedCostLevelRef.current = level;
      notify(
        "COST THRESHOLD",
        `Total cost reached $${cost.toFixed(2)} (limit: $${settings.costThreshold.toFixed(2)})`,
        "#ff6b00",
      );
    }
  }, [globalStats, settings, notify]);

  // Session duration check — runs on a 30s interval
  useEffect(() => {
    if (!settings.enabled || settings.sessionDurationMins <= 0) return;

    const thresholdMs = settings.sessionDurationMins * 60_000;
    const check = () => {
      const now = Date.now();
      for (const session of sessions) {
        if (session.status !== "active") continue;
        const age = now - session.firstEvent;
        if (age >= thresholdMs && !notifiedDurationRef.current.has(session.id)) {
          notifiedDurationRef.current.add(session.id);
          const mins = Math.round(age / 60_000);
          notify(
            "LONG-RUNNING SESSION",
            `Session ${session.id.slice(0, 8)}… running for ${mins} min`,
            "#f0ff00",
          );
        }
      }
    };

    check();
    const interval = setInterval(check, 30_000);
    return () => clearInterval(interval);
  }, [sessions, settings, notify]);

  // Reset tracking when events are cleared
  useEffect(() => {
    if (allEvents.length === 0) {
      prevAllEventsRef.current = [];
      initializedRef.current = false;
      notifiedCostLevelRef.current = 0;
      notifiedDurationRef.current = new Set();
    }
  }, [allEvents]);

  const updateSettings = useCallback((updates: Partial<AlertSettings>) => {
    setSettings((prev) => {
      const next = { ...prev, ...updates };
      saveAlertSettings(next);
      return next;
    });
  }, []);

  return { toasts, dismissToast, settings, updateSettings };
}

export async function requestNotificationPermission(): Promise<NotificationPermission> {
  if (!("Notification" in window)) return "denied";
  if (Notification.permission === "granted") return "granted";
  return Notification.requestPermission();
}

export function getNotificationPermission(): NotificationPermission {
  if (!("Notification" in window)) return "denied";
  return Notification.permission;
}
