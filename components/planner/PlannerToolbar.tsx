"use client";

import type { PlannerView } from "@/lib/plannerViewModel";

type PlannerToolbarProps = {
  query: string;
  onQueryChange: (value: string) => void;
  view: PlannerView;
  onViewChange: (view: PlannerView) => void;
  onScheduleClick: () => void;
  isScheduleActive: boolean;
  orderCount: number;
  taskCount: number;
  workerCount: number;
};

const VIEW_META: Record<PlannerView, { title: string; subtitle: (o: number, t: number, w: number) => string }> = {
  orders: {
    title: "Production Schedule",
    subtitle: (o, t) => `${o} order${o === 1 ? "" : "s"} · ${t} task${t === 1 ? "" : "s"}`,
  },
  workers: {
    title: "Mission Control",
    subtitle: (_, __, w) => `${w} worker${w === 1 ? "" : "s"}`,
  },
};

export default function PlannerToolbar({
  query,
  onQueryChange,
  view,
  onViewChange,
  onScheduleClick,
  isScheduleActive,
  orderCount,
  taskCount,
  workerCount,
}: PlannerToolbarProps) {
  const meta = VIEW_META[view];

  return (
    <div className="flex flex-wrap items-center gap-3 border-b border-[var(--line)] bg-[var(--panel)] px-5 py-3 md:gap-4 md:px-6">
      {/* Title */}
      <div className="flex flex-col leading-tight">
        <h1 className="font-display text-xl font-semibold text-[var(--ink)]">
          {meta.title}
        </h1>
        <p className="text-xs text-[var(--muted)]">
          {meta.subtitle(orderCount, taskCount, workerCount)}
        </p>
      </div>

      <div className="ml-auto flex flex-1 flex-wrap items-center justify-end gap-3">
        {/* Search */}
        <label className="relative flex min-w-[12rem] flex-1 items-center md:max-w-xs">
          <span className="sr-only">Search</span>
          <svg
            aria-hidden
            className="absolute left-3 h-3.5 w-3.5 text-[var(--muted)]"
            viewBox="0 0 20 20"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
          >
            <circle cx="9" cy="9" r="6" />
            <path d="m14 14 3 3" strokeLinecap="round" />
          </svg>
          <input
            value={query}
            onChange={(e) => onQueryChange(e.target.value)}
            placeholder={view === "orders" ? "Search order, stage…" : "Search worker…"}
            aria-label="Search planner"
            type="search"
            className="w-full rounded-full border border-[var(--line)] bg-white py-1.5 pl-8 pr-4 text-sm outline-none transition focus:border-[var(--accent)] focus:ring-1 focus:ring-[var(--accent)]"
          />
        </label>

        {/* View toggle */}
        <div
          role="tablist"
          aria-label="Planner view"
          className="flex items-center rounded-full border border-[var(--line)] bg-white p-0.5 text-sm font-semibold"
        >
          <ViewTab label="Schedule" isSelected={view === "orders"} onClick={() => onViewChange("orders")} />
          <ViewTab label="Workers" isSelected={view === "workers"} onClick={() => onViewChange("workers")} />
        </div>

        {/* Schedule CTA */}
        <button
          type="button"
          onClick={onScheduleClick}
          aria-pressed={isScheduleActive}
          className={`rounded-full px-4 py-1.5 text-sm font-bold uppercase tracking-[0.14em] transition ${
            isScheduleActive
              ? "bg-[var(--ink)] text-white"
              : "bg-[var(--accent)] text-white hover:bg-[var(--ink)]"
          }`}
        >
          + Schedule
        </button>
      </div>
    </div>
  );
}

function ViewTab({
  label,
  isSelected,
  onClick,
}: {
  label: string;
  isSelected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={isSelected}
      onClick={onClick}
      className={`rounded-full px-4 py-1.5 transition ${
        isSelected
          ? "bg-[var(--ink)] text-white shadow-sm"
          : "text-[var(--muted)] hover:text-[var(--ink)]"
      }`}
    >
      {label}
    </button>
  );
}
