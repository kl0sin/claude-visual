import { useState } from "react";

interface HookInstallBannerProps {
  onInstalled: () => void;
  apiBase: string;
  authHeaders: Record<string, string>;
}

export function HookInstallBanner({ onInstalled, apiBase, authHeaders }: HookInstallBannerProps) {
  const [installing, setInstalling] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleInstall = async () => {
    setInstalling(true);
    setError(null);
    try {
      const res = await fetch(`${apiBase}/api/hooks/install`, { method: "POST", headers: authHeaders });
      const data = await res.json();
      if (data.ok) {
        onInstalled();
      } else {
        setError(data.error || "Installation failed");
      }
    } catch (e) {
      setError(String(e));
    } finally {
      setInstalling(false);
    }
  };

  return (
    <div className="hook-install-banner">
      <div className="hook-install-content">
        <div className="hook-install-icon" aria-hidden="true">⬡</div>
        <div className="hook-install-text">
          <span className="hook-install-title">HOOKS NOT DETECTED</span>
          <span className="hook-install-desc">
            Claude Code hooks are required for live monitoring. Install them to start capturing events.
          </span>
        </div>
        <button
          className="hook-install-btn"
          onClick={handleInstall}
          disabled={installing}
          aria-busy={installing}
        >
          {installing ? "INSTALLING..." : "INSTALL HOOKS"}
        </button>
      </div>
      {error && (
        <div className="hook-install-error" role="alert">
          INSTALL FAILED — {error.startsWith("TypeError") || error.startsWith("SyntaxError") ? "Could not reach server. Is Claude Visual running?" : error}
        </div>
      )}
    </div>
  );
}
