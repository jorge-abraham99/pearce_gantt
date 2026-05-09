"use client";

import type { GanttAssignment } from "@/types/planner";

type GanttBarProps = {
  assignment: GanttAssignment;
  color: string;
  left: string;
  width: string;
};

export default function GanttBar({ assignment, color, left, width }: GanttBarProps) {
  return (
    <div
      className="absolute top-3 overflow-hidden rounded-2xl px-3 py-2 text-xs font-semibold text-white shadow-lg"
      style={{
        left,
        width,
        minWidth: 92,
        backgroundColor: color,
      }}
      title={`${assignment.order_number} ${assignment.stage}: ${formatDateTime(
        assignment.schedule_start,
      )} to ${formatDateTime(assignment.schedule_end)}`}
    >
      <div className="truncate">{assignment.order_number}</div>
      <div className="truncate opacity-90">
        {assignment.stage} · {assignment.scheduled_hours}h
      </div>
    </div>
  );
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}
