import { open } from "@tauri-apps/plugin-shell";
import type { UpdateInfo } from "../hooks/useUpdateCheck";

interface UpdateBannerProps {
  update: UpdateInfo;
  onDismiss: () => void;
}

export function UpdateBanner({ update, onDismiss }: UpdateBannerProps) {
  const handleDownload = async () => {
    try {
      await open(update.releaseUrl);
    } catch {
      // Fallback for non-Tauri environments
      window.open(update.releaseUrl, "_blank");
    }
  };

  return (
    <div className="update-banner" role="status" aria-live="polite">
      <span className="update-banner-icon" aria-hidden="true">↑</span>
      <span className="update-banner-text">
        <strong>v{update.version}</strong> is available
      </span>
      <button className="update-banner-btn" onClick={handleDownload}>
        Download
      </button>
      <button className="update-banner-dismiss" onClick={onDismiss} aria-label="Dismiss">
        ×
      </button>
    </div>
  );
}
