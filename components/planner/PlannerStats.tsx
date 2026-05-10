"use client";

import type { PlannerStats } from "@/lib/plannerViewModel";

type PlannerStatsProps = {
  stats: PlannerStats;
};

export default function PlannerStatsStrip({ stats }: PlannerStatsProps) {
  const cards: Array<{ label: string; value: string; hint?: string }> = [
    { label: "Orders", value: String(stats.orderCount) },
    { label: "Assignments", value: String(stats.assignmentCount) },
    { label: "Scheduled", value: `${formatHours(stats.scheduledHours)}h` },
    { label: "Workers", value: String(stats.workerCount) },
  ];

  if (stats.longestOrder) {
    cards.push({
      label: "Longest order",
      value: stats.longestOrder.orderNumber,
      hint: `${stats.longestOrder.durationDays}d`,
    });
  }
  if (stats.largestIdleGap) {
    cards.push({
      label: "Largest gap",
      value: stats.largestIdleGap.orderNumber,
      hint: `${formatHours(stats.largestIdleGap.idleGapHours)}h idle`,
    });
  }
  if (stats.busiestWorker) {
    cards.push({
      label: "Busiest worker",
      value: stats.busiestWorker.workerName,
      hint: `${formatHours(stats.busiestWorker.totalHours)}h`,
    });
  }

  return (
    <div className="flex flex-wrap gap-2 border-b border-[var(--line)] bg-[var(--panel-2)] px-5 py-3 md:px-6">
      {cards.map((card) => (
        <div
          key={`${card.label}-${card.value}`}
          className="min-w-[7.5rem] flex-1 rounded-2xl border border-[var(--line)] bg-white px-4 py-2"
        >
          <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--muted)]">
            {card.label}
          </p>
          <p className="mt-0.5 truncate font-display text-lg font-semibold text-[var(--ink)]">
            {card.value}
          </p>
          {card.hint ? (
            <p className="text-xs text-[var(--muted)]">{card.hint}</p>
          ) : null}
        </div>
      ))}
    </div>
  );
}

function formatHours(value: number): string {
  if (Number.isInteger(value)) return String(value);
  return value.toFixed(1);
}
