"use client";

import { useEffect, useRef, useState } from "react";

import GanttBarTooltip from "@/components/planner/GanttBarTooltip";
import type { PositionedAssignment } from "@/lib/plannerViewModel";

type GanttBarVariant = "solid" | "umbrella";

type OrderSummary = {
  totalHours: number;
  taskCount: number;
  spanStart: Date;
  spanEnd: Date;
};

type GanttBarProps = {
  assignment: PositionedAssignment;
  color: string;
  labelTop?: string;
  labelBottom?: string;
  showLabels?: boolean;
  variant?: GanttBarVariant;
  isSelected: boolean;
  onSelect: () => void;
  rowHeight: number;
  orderSummary?: OrderSummary;
};

const OPEN_DELAY_MS = 80;
const CLOSE_DELAY_MS = 60;

export default function GanttBar({
  assignment,
  color,
  labelTop,
  labelBottom,
  showLabels = true,
  variant = "solid",
  isSelected,
  onSelect,
  rowHeight,
  orderSummary,
}: GanttBarProps) {
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const openTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [anchorRect, setAnchorRect] = useState<DOMRect | null>(null);

  useEffect(
    () => () => {
      if (openTimerRef.current) clearTimeout(openTimerRef.current);
      if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
    },
    [],
  );

  function cancelTimers() {
    if (openTimerRef.current) {
      clearTimeout(openTimerRef.current);
      openTimerRef.current = null;
    }
    if (closeTimerRef.current) {
      clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
  }

  function scheduleOpen() {
    cancelTimers();
    openTimerRef.current = setTimeout(() => {
      if (buttonRef.current) {
        setAnchorRect(buttonRef.current.getBoundingClientRect());
      }
    }, OPEN_DELAY_MS);
  }

  function scheduleClose() {
    cancelTimers();
    closeTimerRef.current = setTimeout(() => {
      setAnchorRect(null);
    }, CLOSE_DELAY_MS);
  }

  function openNow() {
    cancelTimers();
    if (buttonRef.current) {
      setAnchorRect(buttonRef.current.getBoundingClientRect());
    }
  }

  function closeNow() {
    cancelTimers();
    setAnchorRect(null);
  }

  const isUmbrella = variant === "umbrella";
  const top = isUmbrella ? Math.max(4, Math.floor(rowHeight * 0.25)) : 8;
  const height = isUmbrella
    ? Math.max(12, Math.floor(rowHeight * 0.5))
    : Math.max(22, rowHeight - 16);

  const ariaLabel =
    labelTop || labelBottom
      ? `${labelTop ?? ""}${labelBottom ? ` — ${labelBottom}` : ""}`
      : `${assignment.order_number} — ${assignment.stage}`;

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        onClick={() => {
          closeNow();
          onSelect();
        }}
        onMouseEnter={scheduleOpen}
        onMouseLeave={scheduleClose}
        onFocus={openNow}
        onBlur={closeNow}
        aria-label={ariaLabel}
        aria-pressed={isSelected}
        style={{
          left: `${assignment.leftPct}%`,
          width: `${assignment.widthPct}%`,
          top,
          height,
          backgroundColor: color,
          borderColor: color,
          opacity: isUmbrella ? 0.22 : 1,
          boxShadow: isSelected
            ? "0 0 0 2px var(--paper), 0 0 0 4px var(--accent)"
            : undefined,
        }}
        className={`absolute flex flex-col justify-center overflow-hidden px-2.5 text-left text-[11px] font-semibold text-white transition focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] ${
          isUmbrella
            ? "rounded-md border-0 hover:opacity-40"
            : "rounded-lg border-l-4 hover:brightness-110"
        }`}
      >
        {showLabels && labelTop ? (
          <span className="truncate leading-tight">{labelTop}</span>
        ) : null}
        {showLabels && labelBottom ? (
          <span className="truncate text-[10px] font-medium leading-tight text-white/85">
            {labelBottom}
          </span>
        ) : null}
      </button>

      <GanttBarTooltip
        anchorRect={anchorRect}
        assignment={assignment}
        variant={isUmbrella ? "order" : "task"}
        color={color}
        orderSummary={orderSummary}
      />
    </>
  );
}
