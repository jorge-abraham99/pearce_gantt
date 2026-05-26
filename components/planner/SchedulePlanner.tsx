"use client";

import { useEffect, useMemo, useState } from "react";

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
import type {
  PlannerFilters,
  PlannerView,
  TimelineScale,
} from "@/lib/plannerViewModel";
import type {
  BalerType,
  Customer,
  GanttAssignment,
  Id,
  RecalculateFutureScheduleResponse,
  ScheduleOrderResponse,
  WorkerSkill,
} from "@/types/planner";

type Selection =
  | { type: "assignment"; assignmentId: Id }
  | { type: "order"; orderId: Id }
  | { type: "worker"; workerId: Id }
  | null;

type SchedulePlannerProps = {
  initialBalerTypes: BalerType[];
  initialCustomers: Customer[];
  initialAssignments: GanttAssignment[];
  initialWorkerSkills: WorkerSkill[];
};

const COLLAPSED_ORDER_STORAGE_KEY = "pearce-gantt:collapsed-orders";
const FILTER_STORAGE_KEY = "pearce-gantt:planner-filters";
const JUST_ADDED_HIGHLIGHT_MS = 15000;
const EMPTY_FILTERS: PlannerFilters = {
  orderNumber: "",
  customer: "",
  task: "",
};

function readStoredCollapsedOrderIds(): Set<string> {
  if (typeof window === "undefined") return new Set();

  try {
    const raw = window.sessionStorage.getItem(COLLAPSED_ORDER_STORAGE_KEY);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return new Set();
    return new Set(parsed.map((value) => String(value)));
  } catch {
    return new Set();
  }
}

function writeStoredCollapsedOrderIds(ids: Set<string>) {
  if (typeof window === "undefined") return;

  window.sessionStorage.setItem(
    COLLAPSED_ORDER_STORAGE_KEY,
    JSON.stringify(Array.from(ids)),
  );
}

function readStoredFilters(): PlannerFilters {
  if (typeof window === "undefined") return EMPTY_FILTERS;

  try {
    const raw = window.sessionStorage.getItem(FILTER_STORAGE_KEY);
    if (!raw) return EMPTY_FILTERS;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return EMPTY_FILTERS;

    return {
      orderNumber:
        typeof parsed.orderNumber === "string" ? parsed.orderNumber : "",
      customer: typeof parsed.customer === "string" ? parsed.customer : "",
      task: typeof parsed.task === "string" ? parsed.task : "",
    };
  } catch {
    return EMPTY_FILTERS;
  }
}

function writeStoredFilters(filters: PlannerFilters) {
  if (typeof window === "undefined") return;

  window.sessionStorage.setItem(FILTER_STORAGE_KEY, JSON.stringify(filters));
}

export default function SchedulePlanner({
  initialBalerTypes,
  initialCustomers,
  initialAssignments,
  initialWorkerSkills,
}: SchedulePlannerProps) {
  const [view, setView] = useState<PlannerView>("orders");
  const [orderScale, setOrderScale] = useState<TimelineScale>("day");
  const [workerScale, setWorkerScale] = useState<TimelineScale>("day");
  const [filters, setFilters] = useState<PlannerFilters>(EMPTY_FILTERS);
  const [assignments, setAssignments] = useState(initialAssignments);
  const [workerSkills, setWorkerSkills] = useState(initialWorkerSkills);
  const [customers, setCustomers] = useState(initialCustomers);
  const [collapsedOrderIds, setCollapsedOrderIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [hasHydratedStorage, setHasHydratedStorage] = useState(false);
  const [highlightedOrderId, setHighlightedOrderId] = useState<Id | null>(null);
  const [selection, setSelection] = useState<Selection>(null);
  const [isScheduleOpen, setIsScheduleOpen] = useState(false);
  const [isRecalculating, setIsRecalculating] = useState(false);
  const [lastSchedule, setLastSchedule] =
    useState<ScheduleOrderResponse | null>(null);
  const [plannerNotice, setPlannerNotice] = useState<{
    tone: "error" | "success";
    message: string;
  } | null>(null);

  const filteredAssignments = useMemo(
    () => filterAssignments(assignments, filters),
    [assignments, filters],
  );
  const taskOptions = useMemo(
    () => buildTaskOptions(assignments),
    [assignments],
  );
  const customerOptions = useMemo(
    () => buildCustomerOptions(customers, assignments),
    [customers, assignments],
  );
  const orderTimeline = useMemo(
    () => buildTimeline(filteredAssignments, orderScale),
    [filteredAssignments, orderScale],
  );
  const workerTimeline = useMemo(
    () => buildTimeline(filteredAssignments, workerScale),
    [filteredAssignments, workerScale],
  );
  const orderRows = useMemo(
    () => buildOrderRows(filteredAssignments, orderScale),
    [filteredAssignments, orderScale],
  );
  const workerRows = useMemo(
    () => buildWorkerRows(filteredAssignments, workerScale, workerSkills),
    [filteredAssignments, workerScale, workerSkills],
  );
  const orderSummariesById = useMemo(() => {
    const map = new Map<
      string,
      {
        totalHours: number;
        taskCount: number;
        spanStart: Date;
        spanEnd: Date;
      }
    >();
    for (const row of orderRows) {
      map.set(String(row.orderId), {
        totalHours: row.totalHours,
        taskCount: row.assignments.length,
        spanStart: row.start,
        spanEnd: row.end,
      });
    }
    return map;
  }, [orderRows]);
  const stats = useMemo(
    () => buildPlannerStats(filteredAssignments),
    [filteredAssignments],
  );

  useEffect(() => {
    let isActive = true;

    queueMicrotask(() => {
      if (!isActive) return;
      setFilters(readStoredFilters());
      setCollapsedOrderIds(readStoredCollapsedOrderIds());
      setHasHydratedStorage(true);
    });

    return () => {
      isActive = false;
    };
  }, []);

  useEffect(() => {
    if (hasHydratedStorage) {
      writeStoredCollapsedOrderIds(collapsedOrderIds);
    }
  }, [collapsedOrderIds, hasHydratedStorage]);

  useEffect(() => {
    if (hasHydratedStorage) {
      writeStoredFilters(filters);
    }
  }, [filters, hasHydratedStorage]);

  useEffect(() => {
    if (highlightedOrderId === null) return;

    const timer = setTimeout(() => {
      setHighlightedOrderId(null);
    }, JUST_ADDED_HIGHLIGHT_MS);

    return () => clearTimeout(timer);
  }, [highlightedOrderId]);

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
    setPlannerNotice(null);
    setCustomers((current) => ensureCustomerOption(current, response.customer));

    void refreshGantt(response.orderId)
      .catch((err) => {
        setPlannerNotice({
          tone: "error",
          message:
            err instanceof Error ? err.message : "Failed to refresh gantt",
        });
      });
  }

  function handleRecalculateClick() {
    if (isRecalculating) return;

    const confirmed = confirm(
      "Recalculate future schedule for orders that have not started yet?\n\nOrders with any started, in-progress, or completed work will be left unchanged.",
    );
    if (!confirmed) return;

    setIsRecalculating(true);
    setPlannerNotice(null);

    void fetch("/api/recalculate-future-schedule", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ triggeredBy: "planner_ui" }),
    })
      .then(async (res) => {
        const json = await res.json();
        if (!res.ok) {
          throw new Error(
            (json as { error?: string }).error ??
              "Failed to recalculate future schedule",
          );
        }

        const response = json as RecalculateFutureScheduleResponse;
        await refreshGantt();
        setPlannerNotice({
          tone: "success",
          message: buildRecalculationMessage(response),
        });
      })
      .catch((err) => {
        setPlannerNotice({
          tone: "error",
          message:
            err instanceof Error
              ? err.message
              : "Failed to recalculate future schedule",
        });
      })
      .finally(() => {
        setIsRecalculating(false);
      });
  }

  async function refreshGantt(highlightOrderId?: Id | null) {
    const res = await fetch("/api/gantt", { cache: "no-store" });
    const json = await res.json();
    if (!res.ok) {
      throw new Error(json.error ?? "Failed to refresh gantt");
    }
    const fresh = (json.assignments ?? []) as GanttAssignment[];
    const freshWorkerSkills = (json.workerSkills ?? []) as WorkerSkill[];
    setAssignments(fresh);
    setWorkerSkills(freshWorkerSkills);
    if (highlightOrderId !== undefined && highlightOrderId !== null) {
      setHighlightedOrderId(highlightOrderId);
    }
  }

  function toggleOrder(orderId: Id) {
    setCollapsedOrderIds((current) => {
      const next = new Set(current);
      const key = String(orderId);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  }

  const bottomMode: "schedule" | "details" | "empty" = isScheduleOpen
    ? "schedule"
    : effectiveSelection
      ? "details"
      : "empty";

  return (
    <div className="flex h-[calc(100vh-5rem)] min-h-[640px] flex-col overflow-hidden rounded-3xl border border-[var(--line)] bg-[var(--panel)] shadow-panel">
      <PlannerToolbar
        filters={filters}
        onFilterChange={setFilters}
        customerOptions={customerOptions}
        taskOptions={taskOptions}
        view={view}
        onViewChange={setView}
        onScheduleClick={() => {
          setIsScheduleOpen((open) => !open);
          if (!isScheduleOpen) setSelection(null);
        }}
        isScheduleActive={isScheduleOpen}
        onRecalculateClick={handleRecalculateClick}
        isRecalculating={isRecalculating}
        orderCount={stats.orderCount}
        taskCount={stats.assignmentCount}
        workerCount={stats.workerCount}
      />

      <PlannerStatsStrip
        stats={stats}
        timelineScale={view === "orders" ? orderScale : workerScale}
        onTimelineScaleChange={
          view === "orders" ? setOrderScale : setWorkerScale
        }
      />

      {plannerNotice ? (
        <div
          className={`border-b px-5 py-2 text-sm ${
            plannerNotice.tone === "error"
              ? "border-red-200 bg-red-50 text-red-900"
              : "border-emerald-200 bg-emerald-50 text-emerald-900"
          }`}
        >
          {plannerNotice.message}
        </div>
      ) : null}

      <div className="flex min-h-0 flex-1 flex-col">
        {assignments.length === 0 ? (
          <EmptyState onSchedule={() => setIsScheduleOpen(true)} />
        ) : filteredAssignments.length === 0 ? (
          <NoMatchState onClear={() => setFilters(EMPTY_FILTERS)} />
        ) : view === "orders" ? (
          <OrderGanttView
            rows={orderRows}
            timeline={orderTimeline}
            selection={effectiveSelection}
            highlightedOrderId={highlightedOrderId}
            collapsedOrderIds={collapsedOrderIds}
            onToggleOrder={toggleOrder}
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
            highlightedOrderId={highlightedOrderId}
            orderSummariesById={orderSummariesById}
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
        customers={customers}
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

function buildRecalculationMessage(
  response: RecalculateFutureScheduleResponse,
): string {
  if (
    response.ordersRecalculated > 0 &&
    response.assignmentsRemoved === 0 &&
    response.assignmentsCreated === 0
  ) {
    return `No schedule changes were required for ${response.ordersRecalculated} eligible order${
      response.ordersRecalculated === 1 ? "" : "s"
    }.${
      response.ordersSkippedStarted > 0
        ? ` Skipped ${response.ordersSkippedStarted} started order${
            response.ordersSkippedStarted === 1 ? "" : "s"
          }.`
        : ""
    }`;
  }

  if (response.ordersRecalculated === 0) {
    if (response.ordersSkippedStarted > 0) {
      return `No whole orders were eligible to move. ${response.ordersSkippedStarted} order${
        response.ordersSkippedStarted === 1 ? "" : "s"
      } already started or had non-scheduled work.`;
    }
    return "No future scheduled orders needed recalculation.";
  }

  return `Recalculated ${response.ordersRecalculated} order${
    response.ordersRecalculated === 1 ? "" : "s"
  }. Replaced ${response.assignmentsRemoved} future assignment${
    response.assignmentsRemoved === 1 ? "" : "s"
  } with ${response.assignmentsCreated} newly scheduled assignment${
    response.assignmentsCreated === 1 ? "" : "s"
  }.${
    response.ordersSkippedStarted > 0
      ? ` Skipped ${response.ordersSkippedStarted} started order${
          response.ordersSkippedStarted === 1 ? "" : "s"
        }.`
      : ""
  }`;
}

const CANONICAL_STAGE_ORDER: Record<string, number> = {
  welding: 1,
  spraying: 2,
  assembling: 3,
};

function buildTaskOptions(assignments: GanttAssignment[]): string[] {
  const options = new Map<string, string>();

  for (const assignment of assignments) {
    const task = assignment.stage.trim();
    if (!task) continue;
    const key = task.toLowerCase();
    if (!options.has(key)) {
      options.set(key, task);
    }
  }

  return Array.from(options.values()).sort((left, right) => {
    const leftRank =
      CANONICAL_STAGE_ORDER[left.toLowerCase()] ?? Number.MAX_SAFE_INTEGER;
    const rightRank =
      CANONICAL_STAGE_ORDER[right.toLowerCase()] ?? Number.MAX_SAFE_INTEGER;
    if (leftRank !== rightRank) return leftRank - rightRank;
    return left.localeCompare(right, undefined, { sensitivity: "base" });
  });
}

function buildCustomerOptions(
  customers: Customer[],
  assignments: GanttAssignment[],
): string[] {
  const options = new Map<string, string>();

  for (const customer of customers) {
    const name = customer.name.trim();
    if (!name) continue;
    const key = name.toLowerCase();
    if (!options.has(key)) {
      options.set(key, name);
    }
  }

  for (const assignment of assignments) {
    const name = String(assignment.customer ?? "").trim();
    if (!name) continue;
    const key = name.toLowerCase();
    if (!options.has(key)) {
      options.set(key, name);
    }
  }

  return Array.from(options.values()).sort((left, right) =>
    left.localeCompare(right, undefined, { sensitivity: "base" }),
  );
}

function ensureCustomerOption(
  customers: Customer[],
  customerName: string,
): Customer[] {
  const name = customerName.trim();
  if (!name) return customers;

  const exists = customers.some(
    (customer) => customer.name.trim().toLowerCase() === name.toLowerCase(),
  );
  if (exists) return customers;

  return [
    ...customers,
    {
      id: name,
      name,
      active: true,
    },
  ].sort((left, right) =>
    left.name.localeCompare(right.name, undefined, { sensitivity: "base" }),
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
          No assignments match your filters.
        </p>
        <button
          type="button"
          onClick={onClear}
          className="mt-3 rounded-full border border-[var(--line)] px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] text-[var(--muted)] hover:border-[var(--ink)] hover:text-[var(--ink)]"
        >
          Clear filters
        </button>
      </div>
    </div>
  );
}
