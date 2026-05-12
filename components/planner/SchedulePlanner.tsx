"use client";

import { useMemo, useState } from "react";

import BottomPanel from "@/components/planner/BottomPanel";
import OrderGanttView from "@/components/planner/OrderGanttView";
import PlannerStatsStrip from "@/components/planner/PlannerStats";
import PlannerToolbar from "@/components/planner/PlannerToolbar";
import WorkerGanttView from "@/components/planner/WorkerGanttView";
import {
  buildOrderRows,
  buildPlannerStats,
  buildTimeline,
  buildWorkerRows,
  filterAssignments,
} from "@/lib/plannerViewModel";
import type { PlannerView, TimelineScale } from "@/lib/plannerViewModel";
import type {
  BalerType,
  GanttAssignment,
  Id,
  ScheduleOrderResponse,
} from "@/types/planner";

type Selection =
  | { type: "assignment"; assignmentId: Id }
  | { type: "order"; orderId: Id }
  | { type: "worker"; workerId: Id }
  | null;

type SchedulePlannerProps = {
  initialBalerTypes: BalerType[];
  initialAssignments: GanttAssignment[];
};

export default function SchedulePlanner({
  initialBalerTypes,
  initialAssignments,
}: SchedulePlannerProps) {
  const [view, setView] = useState<PlannerView>("orders");
  const [orderScale, setOrderScale] = useState<TimelineScale>("day");
  const [query, setQuery] = useState("");
  const [assignments, setAssignments] = useState(initialAssignments);
  const [selection, setSelection] = useState<Selection>(null);
  const [isScheduleOpen, setIsScheduleOpen] = useState(false);
  const [lastSchedule, setLastSchedule] =
    useState<ScheduleOrderResponse | null>(null);
  const [refreshError, setRefreshError] = useState<string | null>(null);

  const filteredAssignments = useMemo(
    () => filterAssignments(assignments, query),
    [assignments, query],
  );
  const orderTimeline = useMemo(
    () => buildTimeline(filteredAssignments, orderScale),
    [filteredAssignments, orderScale],
  );
  const workerTimeline = useMemo(
    () => buildTimeline(filteredAssignments),
    [filteredAssignments],
  );
  const orderRows = useMemo(
    () => buildOrderRows(filteredAssignments, orderScale),
    [filteredAssignments, orderScale],
  );
  const workerRows = useMemo(
    () => buildWorkerRows(filteredAssignments),
    [filteredAssignments],
  );
  const stats = useMemo(
    () => buildPlannerStats(filteredAssignments),
    [filteredAssignments],
  );

  const effectiveSelection = useMemo<Selection>(() => {
    if (!selection) return null;
    if (selection.type === "assignment") {
      return assignments.some(
        (item) =>
          String(item.assignment_id) === String(selection.assignmentId),
      )
        ? selection
        : null;
    }
    if (selection.type === "order") {
      return assignments.some(
        (item) => String(item.order_id) === String(selection.orderId),
      )
        ? selection
        : null;
    }
    return assignments.some(
      (item) => String(item.worker_id) === String(selection.workerId),
    )
      ? selection
      : null;
  }, [assignments, selection]);

  function handleScheduled(response: ScheduleOrderResponse) {
    setLastSchedule(response);
    setRefreshError(null);

    void fetch("/api/gantt", { cache: "no-store" })
      .then(async (res) => {
        const json = await res.json();
        if (!res.ok) {
          throw new Error(json.error ?? "Failed to refresh gantt");
        }
        const fresh = (json.assignments ?? []) as GanttAssignment[];
        setAssignments(fresh);
        if (response.orderId !== undefined && response.orderId !== null) {
          setSelection({ type: "order", orderId: response.orderId });
        }
      })
      .catch((err) => {
        setRefreshError(
          err instanceof Error ? err.message : "Failed to refresh gantt",
        );
      });
  }

  const bottomMode: "schedule" | "details" | "empty" = isScheduleOpen
    ? "schedule"
    : effectiveSelection
      ? "details"
      : "empty";

  return (
    <div className="flex h-[calc(100vh-2rem)] min-h-[640px] flex-col overflow-hidden rounded-3xl border border-[var(--line)] bg-[var(--panel)] shadow-panel">
      <PlannerToolbar
        query={query}
        onQueryChange={setQuery}
        view={view}
        onViewChange={setView}
        onScheduleClick={() => {
          setIsScheduleOpen((open) => !open);
          if (!isScheduleOpen) setSelection(null);
        }}
        isScheduleActive={isScheduleOpen}
      />

      <PlannerStatsStrip stats={stats} />

      {refreshError ? (
        <div className="border-b border-red-200 bg-red-50 px-5 py-2 text-sm text-red-900">
          {refreshError}
        </div>
      ) : null}

      <div className="flex min-h-0 flex-1 flex-col">
        {assignments.length === 0 ? (
          <EmptyState onSchedule={() => setIsScheduleOpen(true)} />
        ) : filteredAssignments.length === 0 ? (
          <NoMatchState onClear={() => setQuery("")} />
        ) : view === "orders" ? (
          <OrderGanttView
            rows={orderRows}
            timeline={orderTimeline}
            selection={effectiveSelection}
            scale={orderScale}
            onScaleChange={setOrderScale}
            onSelectAssignment={(assignmentId) => {
              setIsScheduleOpen(false);
              setSelection({ type: "assignment", assignmentId });
            }}
            onSelectOrder={(orderId) => {
              setIsScheduleOpen(false);
              setSelection({ type: "order", orderId });
            }}
          />
        ) : (
          <WorkerGanttView
            rows={workerRows}
            timeline={workerTimeline}
            selection={effectiveSelection}
            onSelectAssignment={(assignmentId) => {
              setIsScheduleOpen(false);
              setSelection({ type: "assignment", assignmentId });
            }}
            onSelectWorker={(workerId) => {
              setIsScheduleOpen(false);
              setSelection({ type: "worker", workerId });
            }}
          />
        )}
      </div>

      <BottomPanel
        mode={bottomMode}
        balerTypes={initialBalerTypes}
        selection={effectiveSelection}
        assignments={assignments}
        orderRows={orderRows}
        workerRows={workerRows}
        lastSchedule={lastSchedule}
        onScheduled={handleScheduled}
        onCloseSchedule={() => setIsScheduleOpen(false)}
        onClearSelection={() => setSelection(null)}
        onOpenSchedule={() => {
          setIsScheduleOpen(true);
          setSelection(null);
        }}
      />
    </div>
  );
}

function EmptyState({ onSchedule }: { onSchedule: () => void }) {
  return (
    <div className="flex flex-1 items-center justify-center bg-[var(--panel)] p-10">
      <div className="rounded-3xl border border-dashed border-[var(--line)] bg-white/60 p-10 text-center">
        <p className="font-display text-2xl font-semibold">
          No scheduled work yet.
        </p>
        <p className="mt-2 text-[var(--muted)]">
          Schedule an order to populate the planner.
        </p>
        <button
          type="button"
          onClick={onSchedule}
          className="mt-4 rounded-full bg-[var(--accent)] px-4 py-2 text-sm font-bold uppercase tracking-[0.14em] text-white transition hover:bg-[var(--ink)]"
        >
          + Schedule order
        </button>
      </div>
    </div>
  );
}

function NoMatchState({ onClear }: { onClear: () => void }) {
  return (
    <div className="flex flex-1 items-center justify-center bg-[var(--panel)] p-10">
      <div className="rounded-3xl border border-dashed border-[var(--line)] bg-white/60 p-10 text-center">
        <p className="font-display text-2xl font-semibold">
          No assignments match your search.
        </p>
        <button
          type="button"
          onClick={onClear}
          className="mt-3 rounded-full border border-[var(--line)] px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] text-[var(--muted)] hover:border-[var(--ink)] hover:text-[var(--ink)]"
        >
          Clear search
        </button>
      </div>
    </div>
  );
}
