"use client";

import type { PositionedAssignment } from "@/lib/plannerViewModel";

type GanttBarProps = {
  assignment: PositionedAssignment;
  color: string;
  labelTop: string;
  labelBottom: string;
  isSelected: boolean;
  onSelect: () => void;
  rowHeight: number;
};

export default function GanttBar({
  assignment,
  color,
  labelTop,
  labelBottom,
  isSelected,
  onSelect,
  rowHeight,
}: GanttBarProps) {
  const tooltip = [
    `Order: ${assignment.order_number}`,
    `Baler: ${assignment.baler_name}`,
    `Stage: ${assignment.stage}`,
    `Worker: ${assignment.worker_name}`,
    `Hours: ${assignment.scheduled_hours}`,
    `Start: ${formatDateTime(assignment.startDate)}`,
    `End: ${formatDateTime(assignment.endDate)}`,
    `Status: ${assignment.status}`,
  ].join("\n");

  const top = 8;
  const height = Math.max(28, rowHeight - 16);

  return (
    <button
      type="button"
      onClick={onSelect}
      title={tooltip}
      aria-label={`${labelTop} — ${labelBottom}`}
      aria-pressed={isSelected}
      style={{
        left: `${assignment.leftPct}%`,
        width: `${assignment.widthPct}%`,
        top,
        height,
        backgroundColor: color,
        borderColor: color,
        boxShadow: isSelected
          ? "0 0 0 2px var(--paper), 0 0 0 4px var(--accent)"
          : undefined,
      }}
      className="absolute flex flex-col justify-center overflow-hidden rounded-lg border-l-4 px-2.5 text-left text-[11px] font-semibold text-white transition focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] hover:brightness-110"
    >
      <span className="truncate leading-tight">{labelTop}</span>
      <span className="truncate text-[10px] font-medium leading-tight text-white/85">
        {labelBottom}
      </span>
    </button>
  );
}

function formatDateTime(date: Date): string {
  return new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}
