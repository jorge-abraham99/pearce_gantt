"use client";

import type { PositionedAssignment } from "@/lib/plannerViewModel";

type GanttBarVariant = "solid" | "umbrella";

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
};

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
    <button
      type="button"
      onClick={onSelect}
      title={tooltip}
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
  );
}

function formatDateTime(date: Date): string {
  return new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}
