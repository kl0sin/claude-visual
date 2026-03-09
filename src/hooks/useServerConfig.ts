import { useState, useCallback, useMemo } from "react";

export interface ServerInstance {
  id: string;
  name: string;
  url: string; // HTTP base, e.g. "http://192.168.1.5:3200"
  token?: string; // Optional auth token
}

interface StoredConfig {
  servers: ServerInstance[]; // all servers — local always first in state
  activeId: string;
}

const STORAGE_KEY = "claude-visual:servers";
const LOCAL_ID = "local";

function isInTauri(): boolean {
  // Tauri v1 sets window.__TAURI__; Tauri v2 sets window.__TAURI_INTERNALS__
  return !!(window as any).__TAURI__ || !!(window as any).__TAURI_INTERNALS__;
}

function makeLocalServer(): ServerInstance {
  return {
    id: LOCAL_ID,
    name: "Local",
    url: isInTauri() ? "http://localhost:3200" : window.location.origin,
  };
}

function loadConfig(): StoredConfig {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as { servers: ServerInstance[]; activeId: string };
      return {
        servers: [makeLocalServer(), ...(parsed.servers ?? [])],
        activeId: parsed.activeId ?? LOCAL_ID,
      };
    }
  } catch {}
  return { servers: [makeLocalServer()], activeId: LOCAL_ID };
}

function saveConfig(config: StoredConfig): void {
  try {
    // Don't persist the local server — it's always derived at runtime
    const toSave = {
      servers: config.servers.filter((s) => s.id !== LOCAL_ID),
      activeId: config.activeId,
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(toSave));
  } catch {}
}

function toWsUrl(server: ServerInstance): string {
  if (server.id === LOCAL_ID && !isInTauri()) {
    // Use current browser host so Vite proxy / same-origin serving both work
    const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
    return `${proto}//${window.location.host}/ws`;
  }
  const base = server.url.replace(/^http/, (m) => (m === "https" ? "wss" : "ws")) + "/ws";
  return server.token ? `${base}?token=${encodeURIComponent(server.token)}` : base;
}

function toApiBase(server: ServerInstance): string {
  // Non-Tauri local: use relative URLs so Vite proxy / same-origin prod both work
  if (server.id === LOCAL_ID && !isInTauri()) return "";
  return server.url;
}

function toAuthHeaders(token?: string): Record<string, string> {
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export interface UseServerConfigReturn {
  servers: ServerInstance[];
  activeId: string;
  activeServer: ServerInstance;
  wsUrl: string;
  apiBase: string;
  authHeaders: Record<string, string>;
  addServer: (s: Omit<ServerInstance, "id">) => ServerInstance;
  removeServer: (id: string) => void;
  selectServer: (id: string) => void;
  updateServer: (id: string, updates: Partial<Omit<ServerInstance, "id">>) => void;
}

let idSeq = 0;

export function useServerConfig(): UseServerConfigReturn {
  const [config, setConfig] = useState<StoredConfig>(loadConfig);

  const activeServer = useMemo(
    () => config.servers.find((s) => s.id === config.activeId) ?? makeLocalServer(),
    [config],
  );

  const wsUrl = useMemo(() => toWsUrl(activeServer), [activeServer]);
  const apiBase = useMemo(() => toApiBase(activeServer), [activeServer]);
  const authHeaders = useMemo(() => toAuthHeaders(activeServer.token), [activeServer]);

  const persist = useCallback((next: StoredConfig) => {
    setConfig(next);
    saveConfig(next);
  }, []);

  const addServer = useCallback(
    (s: Omit<ServerInstance, "id">): ServerInstance => {
      const server: ServerInstance = { ...s, id: `srv-${++idSeq}-${Date.now()}` };
      persist({ servers: [...config.servers, server], activeId: config.activeId });
      return server;
    },
    [config, persist],
  );

  const removeServer = useCallback(
    (id: string) => {
      if (id === LOCAL_ID) return;
      const servers = config.servers.filter((s) => s.id !== id);
      persist({
        servers,
        activeId: config.activeId === id ? LOCAL_ID : config.activeId,
      });
    },
    [config, persist],
  );

  const selectServer = useCallback(
    (id: string) => {
      if (!config.servers.some((s) => s.id === id)) return;
      persist({ ...config, activeId: id });
    },
    [config, persist],
  );

  const updateServer = useCallback(
    (id: string, updates: Partial<Omit<ServerInstance, "id">>) => {
      if (id === LOCAL_ID) return;
      const servers = config.servers.map((s) => (s.id === id ? { ...s, ...updates } : s));
      persist({ ...config, servers });
    },
    [config, persist],
  );

  return {
    servers: config.servers,
    activeId: config.activeId,
    activeServer,
    wsUrl,
    apiBase,
    authHeaders,
    addServer,
    removeServer,
    selectServer,
    updateServer,
  };
}
