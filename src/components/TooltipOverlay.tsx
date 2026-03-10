import { useState, useEffect, useRef, useLayoutEffect } from "react";
import { createPortal } from "react-dom";

interface TooltipState {
  text: string;
  cursorX: number;
  cursorY: number;
}

interface TooltipPosition {
  left: number;
  top: number;
  // Whether tooltip was flipped below cursor due to top-edge overflow
  below: boolean;
}

const OFFSET = 10;
const MARGIN = 6;

function clampPosition(
  cursorX: number,
  cursorY: number,
  width: number,
  height: number,
): TooltipPosition {
  const vw = window.innerWidth;
  const vh = window.innerHeight;

  // Default: centered above cursor
  let left = cursorX - width / 2;
  let top = cursorY - height - OFFSET;
  let below = false;

  // Flip below cursor if not enough space on top
  if (top < MARGIN) {
    top = cursorY + OFFSET;
    below = true;
  }

  // Clamp horizontally
  left = Math.max(MARGIN, Math.min(vw - width - MARGIN, left));
  // Clamp vertically (bottom edge)
  top = Math.min(vh - height - MARGIN, top);

  return { left, top, below };
}

export function TooltipOverlay() {
  const [tooltip, setTooltip] = useState<TooltipState | null>(null);
  const [pos, setPos] = useState<TooltipPosition | null>(null);
  const currentTarget = useRef<HTMLElement | null>(null);
  const tooltipRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    function getTooltipTarget(e: MouseEvent): HTMLElement | null {
      return (e.target as HTMLElement).closest("[data-tooltip]") as HTMLElement | null;
    }

    function onMouseOver(e: MouseEvent) {
      const target = getTooltipTarget(e);
      if (!target) {
        setTooltip(null);
        setPos(null);
        currentTarget.current = null;
        return;
      }
      const text = target.getAttribute("data-tooltip");
      if (!text) return;
      currentTarget.current = target;
      setTooltip({ text, cursorX: e.clientX, cursorY: e.clientY });
    }

    function onMouseMove(e: MouseEvent) {
      if (!currentTarget.current) return;
      setTooltip((prev) =>
        prev ? { ...prev, cursorX: e.clientX, cursorY: e.clientY } : null,
      );
    }

    function onMouseOut(e: MouseEvent) {
      const target = getTooltipTarget(e);
      if (target && target === currentTarget.current) return;
      currentTarget.current = null;
      setTooltip(null);
      setPos(null);
    }

    document.addEventListener("mouseover", onMouseOver);
    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseout", onMouseOut);
    return () => {
      document.removeEventListener("mouseover", onMouseOver);
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseout", onMouseOut);
    };
  }, []);

  // After each render, measure the tooltip element and compute clamped position
  useLayoutEffect(() => {
    if (!tooltip || !tooltipRef.current) {
      setPos(null);
      return;
    }
    const { offsetWidth: w, offsetHeight: h } = tooltipRef.current;
    setPos(clampPosition(tooltip.cursorX, tooltip.cursorY, w, h));
  }, [tooltip]);

  if (!tooltip) return null;

  return createPortal(
    <div
      ref={tooltipRef}
      className="tooltip-overlay"
      style={
        pos
          ? { left: pos.left, top: pos.top, transform: "none", visibility: "visible" }
          : { left: tooltip.cursorX, top: tooltip.cursorY, visibility: "hidden" }
      }
      role="tooltip"
    >
      {tooltip.text}
    </div>,
    document.body,
  );
}
