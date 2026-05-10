"use client";

import type { PlannerView } from "@/lib/plannerViewModel";

type PlannerToolbarProps = {
  query: string;
  onQueryChange: (value: string) => void;
  view: PlannerView;
  onViewChange: (view: PlannerView) => void;
  onScheduleClick: () => void;
  isScheduleActive: boolean;
};

export default function PlannerToolbar({
  query,
  onQueryChange,
  view,
  onViewChange,
  onScheduleClick,
  isScheduleActive,
}: PlannerToolbarProps) {
  return (
    <div className="flex flex-wrap items-center gap-3 border-b border-[var(--line)] bg-[var(--panel)] px-5 py-4 md:gap-4 md:px-6">
      <div className="flex flex-col">
        <p className="text-[10px] font-bold uppercase tracking-[0.24em] text-[var(--accent)]">
          Pearce Planner
        </p>
        <h1 className="font-display text-xl font-semibold leading-tight text-[var(--ink)] md:text-2xl">
          Schedule console
        </h1>
      </div>

      <div className="ml-auto flex flex-1 flex-wrap items-center justify-end gap-3 md:gap-4">
        <label className="relative flex min-w-[14rem] flex-1 items-center md:max-w-md">
          <span className="sr-only">Search planner</span>
          <svg
            aria-hidden
            className="absolute left-3 h-4 w-4 text-[var(--muted)]"
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
            onChange={(event) => onQueryChange(event.target.value)}
            placeholder="Search order, worker, stage…"
            aria-label="Search planner"
            className="w-full rounded-full border border-[var(--line)] bg-white py-2 pl-9 pr-4 text-sm outline-none transition focus:border-[var(--accent)] focus:ring-1 focus:ring-[var(--accent)]"
            type="search"
          />
        </label>

        <div
          role="tablist"
          aria-label="Planner view"
          className="flex items-center rounded-full border border-[var(--line)] bg-white p-1 text-sm font-semibold"
        >
          <ViewTab
            label="Orders"
            isSelected={view === "orders"}
            onClick={() => onViewChange("orders")}
          />
          <ViewTab
            label="Workers"
            isSelected={view === "workers"}
            onClick={() => onViewChange("workers")}
          />
        </div>

        <button
          type="button"
          onClick={onScheduleClick}
          aria-pressed={isScheduleActive}
          className={`rounded-full px-4 py-2 text-sm font-bold uppercase tracking-[0.14em] transition ${
            isScheduleActive
              ? "bg-[var(--ink)] text-white"
              : "bg-[var(--accent)] text-white hover:bg-[var(--ink)]"
          }`}
        >
          + Schedule order
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
