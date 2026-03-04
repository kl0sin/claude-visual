import { useState, useRef, useCallback, useTransition, useEffect } from "react";
import type { ClaudeEvent } from "../types";

export type ReplayState = "loading" | "idle" | "playing" | "paused" | "completed";
export type ReplaySpeed = 1 | 5 | 10;

export interface UseReplaySessionReturn {
  visibleEvents: ClaudeEvent[];
  state: ReplayState;
  speed: ReplaySpeed;
  progress: number;
  currentIndex: number;
  totalEvents: number;
  play: () => void;
  pause: () => void;
  setSpeed: (s: ReplaySpeed) => void;
  seek: (index: number) => void;
  reset: () => void;
}

// Cap inter-event delay to avoid huge gaps between events
const MAX_DELAY_MS = 3000;

export function useReplaySession(
  sessionId: string,
  apiBase: string,
  authHeaders: Record<string, string>,
): UseReplaySessionReturn {
  const [visibleEvents, setVisibleEvents] = useState<ClaudeEvent[]>([]);
  const [replayState, setReplayState] = useState<ReplayState>("loading");
  const [speed, setSpeedState] = useState<ReplaySpeed>(1);

  // Transient refs — don't trigger re-renders
  const eventsRef = useRef<ClaudeEvent[]>([]);
  const indexRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const speedRef = useRef<ReplaySpeed>(1);
  const stateRef = useRef<ReplayState>("loading");

  const [, startTransition] = useTransition();

  // Keep stateRef in sync
  const setState = useCallback((s: ReplayState) => {
    stateRef.current = s;
    setReplayState(s);
  }, []);

  // Load events on mount
  useEffect(() => {
    setState("loading");
    fetch(`${apiBase}/api/sessions/${encodeURIComponent(sessionId)}/events`, {
      headers: authHeaders,
    })
      .then((r) => r.json())
      .then((data: { events: ClaudeEvent[] }) => {
        eventsRef.current = data.events ?? [];
        setState("idle");
      })
      .catch(() => setState("idle"));
  }, [sessionId, apiBase]);

  const clearTimer = useCallback(() => {
    if (timerRef.current !== undefined) {
      clearTimeout(timerRef.current);
      timerRef.current = undefined;
    }
  }, []);

  const scheduleNext = useCallback((index: number) => {
    if (index >= eventsRef.current.length) {
      setState("completed");
      return;
    }
    const curr = eventsRef.current[index]!;
    const prev = eventsRef.current[index - 1];
    const rawDelay = prev ? curr.timestamp - prev.timestamp : 0;
    const delay = Math.min(rawDelay, MAX_DELAY_MS) / speedRef.current;

    timerRef.current = setTimeout(() => {
      setVisibleEvents((v) => [...v, curr]);
      indexRef.current = index + 1;
      scheduleNext(index + 1);
    }, delay);
  }, []);

  const play = useCallback(() => {
    if (stateRef.current === "completed" || stateRef.current === "loading") return;
    setState("playing");
    scheduleNext(indexRef.current);
  }, [scheduleNext]);

  const pause = useCallback(() => {
    if (stateRef.current !== "playing") return;
    clearTimer();
    setState("paused");
  }, [clearTimer]);

  const setSpeed = useCallback((s: ReplaySpeed) => {
    speedRef.current = s;
    setSpeedState(s);
    // If currently playing, restart scheduling from current index with new speed
    if (stateRef.current === "playing") {
      clearTimer();
      scheduleNext(indexRef.current);
    }
  }, [clearTimer, scheduleNext]);

  const seek = useCallback((index: number) => {
    const clamped = Math.max(0, Math.min(index, eventsRef.current.length));
    const wasPlaying = stateRef.current === "playing";
    clearTimer();
    startTransition(() => {
      setVisibleEvents(eventsRef.current.slice(0, clamped));
    });
    indexRef.current = clamped;
    if (clamped >= eventsRef.current.length) {
      setState("completed");
    } else if (wasPlaying) {
      setState("playing");
      scheduleNext(clamped);
    } else {
      setState("paused");
    }
  }, [clearTimer, scheduleNext]);

  const reset = useCallback(() => {
    clearTimer();
    setVisibleEvents([]);
    indexRef.current = 0;
    setState("idle");
  }, [clearTimer]);

  // Cleanup on unmount
  useEffect(() => () => clearTimer(), [clearTimer]);

  // Derived state
  const totalEvents = eventsRef.current.length;
  const currentIndex = visibleEvents.length;
  const progress = totalEvents > 0 ? currentIndex / totalEvents : 0;

  return {
    visibleEvents,
    state: replayState,
    speed,
    progress,
    currentIndex,
    totalEvents,
    play,
    pause,
    setSpeed,
    seek,
    reset,
  };
}
