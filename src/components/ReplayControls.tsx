import { memo } from "react";
import type { ReplayState, ReplaySpeed } from "../hooks/useReplaySession";

interface ReplayControlsProps {
  state: ReplayState;
  speed: ReplaySpeed;
  progress: number;
  currentIndex: number;
  totalEvents: number;
  sessionId: string;
  onPlay: () => void;
  onPause: () => void;
  onReset: () => void;
  onSpeedChange: (s: ReplaySpeed) => void;
  onSeek: (index: number) => void;
  onBack: () => void;
}

const SPEEDS: ReplaySpeed[] = [1, 5, 10];

export const ReplayControls = memo(function ReplayControls({
  state,
  speed,
  progress,
  currentIndex,
  totalEvents,
  sessionId,
  onPlay,
  onPause,
  onReset,
  onSpeedChange,
  onSeek,
  onBack,
}: ReplayControlsProps) {
  const isLoading = state === "loading";
  const isPlaying = state === "playing";
  const isCompleted = state === "completed";

  const shortId = sessionId.length > 12 ? sessionId.slice(0, 8) + "…" : sessionId;

  return (
    <div className="replay-controls" role="toolbar" aria-label="Replay controls">
      <button className="replay-btn replay-back-btn" onClick={onBack} title="Back to live view">
        ← LIVE
      </button>

      <div className="replay-session-id" title={sessionId}>
        SESSION: {shortId}
      </div>

      <div className="replay-controls-divider" />

      <button
        className="replay-btn"
        onClick={onReset}
        disabled={isLoading || (state === "idle" && currentIndex === 0)}
        title="Reset replay"
      >
        ◀◀ RESET
      </button>

      <button
        className="replay-btn replay-play-btn"
        onClick={isPlaying ? onPause : onPlay}
        disabled={isLoading || isCompleted}
        title={isPlaying ? "Pause" : "Play"}
      >
        {isLoading ? "LOADING…" : isPlaying ? "⏸ PAUSE" : isCompleted ? "DONE" : "▶ PLAY"}
      </button>

      <div className="replay-speed-group" role="group" aria-label="Playback speed">
        {SPEEDS.map((s) => (
          <button
            key={s}
            className={`replay-speed-btn${speed === s ? " active" : ""}`}
            onClick={() => onSpeedChange(s)}
            disabled={isLoading}
            aria-pressed={speed === s}
          >
            ×{s}
          </button>
        ))}
      </div>

      <div className="replay-progress-wrapper">
        <div
          className="replay-progress"
          role="slider"
          aria-label="Replay progress"
          aria-valuemin={0}
          aria-valuemax={totalEvents}
          aria-valuenow={currentIndex}
          onClick={(e) => {
            if (totalEvents === 0) return;
            const rect = e.currentTarget.getBoundingClientRect();
            const ratio = (e.clientX - rect.left) / rect.width;
            onSeek(Math.round(ratio * totalEvents));
          }}
        >
          <div
            className="replay-progress-bar"
            style={{ width: `${progress * 100}%` }}
          />
        </div>
        <span className="replay-progress-text">
          {currentIndex} / {totalEvents}
        </span>
      </div>
    </div>
  );
});
