import { useEffect, useState } from "react";

const REPO = "kl0sin/claude-visual";
const CURRENT_VERSION = "0.3.1";
const CHECK_DELAY_MS = 5_000; // wait a bit after app start before hitting GitHub API

export interface UpdateInfo {
  version: string; // e.g. "0.3.2"
  releaseUrl: string;
  releaseNotes: string;
}

function parseVersion(tag: string): number[] {
  return tag
    .replace(/^v/, "")
    .split(".")
    .map((n) => parseInt(n, 10) || 0);
}

function isNewer(remote: string, current: string): boolean {
  const r = parseVersion(remote);
  const c = parseVersion(current);
  for (let i = 0; i < 3; i++) {
    if ((r[i] ?? 0) > (c[i] ?? 0)) return true;
    if ((r[i] ?? 0) < (c[i] ?? 0)) return false;
  }
  return false;
}

function isInTauri(): boolean {
  return !!(window as any).__TAURI__ || !!(window as any).__TAURI_INTERNALS__;
}

export function useUpdateCheck(): { update: UpdateInfo | null; dismiss: () => void } {
  const [update, setUpdate] = useState<UpdateInfo | null>(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    // Only check for updates inside the desktop app
    if (!isInTauri()) return;

    const timer = setTimeout(async () => {
      try {
        const res = await fetch(
          `https://api.github.com/repos/${REPO}/releases/latest`,
          { headers: { Accept: "application/vnd.github+json" } },
        );
        if (!res.ok) return;
        const data = await res.json();
        const remoteTag: string = data.tag_name ?? "";
        if (!remoteTag || !isNewer(remoteTag, CURRENT_VERSION)) return;

        setUpdate({
          version: remoteTag.replace(/^v/, ""),
          releaseUrl: data.html_url ?? `https://github.com/${REPO}/releases/latest`,
          releaseNotes: data.body ?? "",
        });
      } catch {
        // Silently ignore — update check is best-effort
      }
    }, CHECK_DELAY_MS);

    return () => clearTimeout(timer);
  }, []);

  return {
    update: dismissed ? null : update,
    dismiss: () => setDismissed(true),
  };
}
