import type { UpdateInfo } from "../hooks/useUpdateCheck";

interface UpdateBannerProps {
  update: UpdateInfo;
  onDismiss: () => void;
}

export function UpdateBanner({ update, onDismiss }: UpdateBannerProps) {
  return (
    <div className="update-banner" role="status" aria-live="polite">
      <span className="update-banner-icon" aria-hidden="true">↑</span>
      <span className="update-banner-text">
        <strong>v{update.version}</strong> is available
      </span>
      <a
        className="update-banner-btn"
        href={update.releaseUrl}
        target="_blank"
        rel="noreferrer"
      >
        Download
      </a>
      <button className="update-banner-dismiss" onClick={onDismiss} aria-label="Dismiss">
        ×
      </button>
    </div>
  );
}
