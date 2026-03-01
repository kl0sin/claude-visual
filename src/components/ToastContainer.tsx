import { useEffect } from "react";
import type { Toast } from "../hooks/useNotifications";

const DISMISS_MS = 5_000;

const TOAST_ICONS: Record<string, string> = {
  "#ff0040": "✗",
  "#ff2d95": "⚠",
  "#ff6b00": "◆",
  "#f0ff00": "◉",
  "#00f0ff": "▶",
};

function getIcon(color: string): string {
  return TOAST_ICONS[color] ?? "◆";
}

interface ToastItemProps {
  toast: Toast;
  onDismiss: (id: string) => void;
}

function ToastItem({ toast, onDismiss }: ToastItemProps) {
  const { id, title, body, color } = toast;

  useEffect(() => {
    const timer = setTimeout(() => onDismiss(id), DISMISS_MS);
    return () => clearTimeout(timer);
  }, [id, onDismiss]);

  return (
    <div
      className="toast"
      style={{ "--toast-color": color } as React.CSSProperties}
      role="alert"
      aria-live="assertive"
    >
      <div className="toast-header">
        <span className="toast-icon" aria-hidden="true">
          {getIcon(color)}
        </span>
        <span className="toast-title">{title}</span>
        <button
          className="toast-close"
          onClick={() => onDismiss(id)}
          aria-label="Dismiss notification"
        >
          ×
        </button>
      </div>
      {body && <div className="toast-body">{body}</div>}
      <div className="toast-progress" />
    </div>
  );
}

interface ToastContainerProps {
  toasts: Toast[];
  onDismiss: (id: string) => void;
}

export function ToastContainer({ toasts, onDismiss }: ToastContainerProps) {
  if (toasts.length === 0) return null;

  return (
    <div className="toast-container" aria-label="Notifications">
      {toasts.map((t) => (
        <ToastItem key={t.id} toast={t} onDismiss={onDismiss} />
      ))}
    </div>
  );
}
