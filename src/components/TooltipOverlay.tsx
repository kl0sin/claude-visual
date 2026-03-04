import { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";

interface TooltipState {
  text: string;
  x: number;
  y: number;
}

export function TooltipOverlay() {
  const [tooltip, setTooltip] = useState<TooltipState | null>(null);
  const currentTarget = useRef<HTMLElement | null>(null);

  useEffect(() => {
    function getTooltipTarget(e: MouseEvent): HTMLElement | null {
      return (e.target as HTMLElement).closest("[data-tooltip]") as HTMLElement | null;
    }

    function onMouseOver(e: MouseEvent) {
      const target = getTooltipTarget(e);
      if (!target) { setTooltip(null); currentTarget.current = null; return; }
      const text = target.getAttribute("data-tooltip");
      if (!text) return;
      currentTarget.current = target;
      setTooltip({ text, x: e.clientX, y: e.clientY });
    }

    function onMouseMove(e: MouseEvent) {
      if (!currentTarget.current) return;
      setTooltip((prev) => prev ? { ...prev, x: e.clientX, y: e.clientY } : null);
    }

    function onMouseOut(e: MouseEvent) {
      const target = getTooltipTarget(e);
      if (target && target === currentTarget.current) return;
      currentTarget.current = null;
      setTooltip(null);
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

  if (!tooltip) return null;

  return createPortal(
    <div
      className="tooltip-overlay"
      style={{ left: tooltip.x, top: tooltip.y }}
      role="tooltip"
    >
      {tooltip.text}
    </div>,
    document.body
  );
}
