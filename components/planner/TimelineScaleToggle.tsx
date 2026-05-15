"use client";

import type { TimelineScale } from "@/lib/plannerViewModel";

type TimelineScaleToggleProps = {
  scale: TimelineScale;
  onChange: (scale: TimelineScale) => void;
};

const SCALE_OPTIONS: Array<{ label: string; value: TimelineScale }> = [
  { label: "Day", value: "day" },
  { label: "Week", value: "week" },
  { label: "Month", value: "month" },
];

export default function TimelineScaleToggle({
  scale,
  onChange,
}: TimelineScaleToggleProps) {
  return (
    <div
      role="tablist"
      aria-label="Timeline scale"
      className="flex items-center rounded-full border border-[var(--line)] bg-white p-0.5 text-sm font-semibold shadow-sm"
    >
      {SCALE_OPTIONS.map((option) => (
        <button
          key={option.value}
          type="button"
          role="tab"
          aria-selected={scale === option.value}
          onClick={() => onChange(option.value)}
          className={`rounded-full px-4 py-1.5 transition ${
            scale === option.value
              ? "bg-[var(--ink)] text-white"
              : "text-[var(--muted)] hover:text-[var(--ink)]"
          }`}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
