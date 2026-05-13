"use client";

import type { PlannerStats } from "@/lib/plannerViewModel";

export default function PlannerStatsStrip({ stats }: { stats: PlannerStats }) {
  const items: Array<{ label: string; value: string; accent?: boolean }> = [
    { label: "Orders", value: String(stats.orderCount) },
    { label: "Workers", value: String(stats.workerCount) },
    { label: "Total hours", value: `${formatHours(stats.scheduledHours)}h` },
  ];

  if (stats.busiestWorker) {
    items.push({
      label: "Busiest",
      value: initials(stats.busiestWorker.workerName),
      accent: false,
    });
  }
  if (stats.longestOrder) {
    items.push({
      label: "Longest",
      value: `${stats.longestOrder.durationDays}d`,
    });
  }
  if (stats.largestIdleGap && stats.largestIdleGap.idleGapHours >= 1) {
    items.push({
      label: "Idle gap",
      value: `${formatHours(stats.largestIdleGap.idleGapHours)}h`,
      accent: true,
    });
  }

  return (
    <div className="flex items-stretch border-b border-[var(--line)] bg-[var(--panel-2)]">
      {items.map((item, index) => (
        <div
          key={item.label}
          className={`flex flex-col justify-center px-5 py-2.5 ${
            index < items.length - 1 ? "border-r border-[var(--line)]" : ""
          }`}
        >
          <p className="text-[9px] font-bold uppercase tracking-[0.22em] text-[var(--muted)]">
            {item.label}
          </p>
          <p
            className={`font-display text-xl font-semibold tabular-nums leading-tight ${
              item.accent ? "text-[var(--accent)]" : "text-[var(--ink)]"
            }`}
          >
            {item.value}
          </p>
        </div>
      ))}
      {/* spacer */}
      <div className="flex-1" />
    </div>
  );
}

function formatHours(value: number): string {
  if (Number.isInteger(value)) return String(value);
  return value.toFixed(1);
}

function initials(name: string): string {
  return name
    .split(" ")
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");
}
