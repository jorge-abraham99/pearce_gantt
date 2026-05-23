"use client";

import ScheduleOrderForm from "@/components/planner/ScheduleOrderForm";
import SelectionDetails from "@/components/planner/SelectionDetails";
import type {
  OrderGanttRow,
  WorkerGanttRow,
} from "@/lib/plannerViewModel";
import type {
  BalerType,
  Customer,
  GanttAssignment,
  Id,
  ScheduleOrderResponse,
} from "@/types/planner";

type Selection =
  | { type: "assignment"; assignmentId: Id }
  | { type: "order"; orderId: Id }
  | { type: "worker"; workerId: Id }
  | null;

type BottomPanelMode = "schedule" | "details" | "empty";

type BottomPanelProps = {
  mode: BottomPanelMode;
  balerTypes: BalerType[];
  customers: Customer[];
  selection: Selection;
  assignments: GanttAssignment[];
  orderRows: OrderGanttRow[];
  workerRows: WorkerGanttRow[];
  lastSchedule: ScheduleOrderResponse | null;
  onScheduled: (response: ScheduleOrderResponse) => void;
  onCloseSchedule: () => void;
  onClearSelection: () => void;
  onOpenSchedule: () => void;
};

export default function BottomPanel({
  mode,
  balerTypes,
  customers,
  selection,
  assignments,
  orderRows,
  workerRows,
  lastSchedule,
  onScheduled,
  onCloseSchedule,
  onClearSelection,
  onOpenSchedule,
}: BottomPanelProps) {
  return (
    <div className="border-t border-[var(--line)] bg-[var(--panel-2)] px-5 py-4 md:px-6">
      {mode === "schedule" ? (
        <div className="grid gap-4 lg:grid-cols-[1fr_18rem]">
          <ScheduleOrderForm
            balerTypes={balerTypes}
            customers={customers}
            onScheduled={onScheduled}
            onClose={onCloseSchedule}
          />
          {lastSchedule ? <LastScheduleCard last={lastSchedule} /> : null}
        </div>
      ) : null}

      {mode === "details" ? (
        <SelectionDetails
          selection={selection}
          assignments={assignments}
          orderRows={orderRows}
          workerRows={workerRows}
          onClear={onClearSelection}
        />
      ) : null}

      {mode === "empty" ? (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-[var(--muted)]">
            Click a row or bar for details, or schedule a new order.
          </p>
          <button
            type="button"
            onClick={onOpenSchedule}
            className="rounded-full bg-[var(--accent)] px-4 py-2 text-sm font-bold uppercase tracking-[0.14em] text-white transition hover:bg-[var(--ink)]"
          >
            + Schedule order
          </button>
        </div>
      ) : null}
    </div>
  );
}

function LastScheduleCard({ last }: { last: ScheduleOrderResponse }) {
  return (
    <div className="rounded-2xl bg-[var(--ink)] p-4 text-white">
      <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#f2c8b8]">
        Just scheduled
      </p>
      <p className="mt-1 font-display text-xl font-semibold">
        {last.balerName} · {last.customer}
      </p>
      <p className="text-sm text-white/80">{last.orderNumber}</p>
      <dl className="mt-2 grid grid-cols-2 gap-1.5 text-xs text-white/80">
        <div>
          <dt className="uppercase tracking-[0.14em] opacity-70">Hours</dt>
          <dd>{last.totalScheduledHours}</dd>
        </div>
        <div>
          <dt className="uppercase tracking-[0.14em] opacity-70">Stages</dt>
          <dd>{last.assignmentsCreated}</dd>
        </div>
      </dl>
      <div className="mt-3 rounded-xl bg-white/8 px-3 py-2 text-xs text-white/85">
        <div className="flex items-center justify-between gap-3">
          <span className="uppercase tracking-[0.14em] opacity-70">
            Requested
          </span>
          <span>{formatDateLabel(last.requestedStartDate)}</span>
        </div>
        <div className="mt-1 flex items-center justify-between gap-3">
          <span className="uppercase tracking-[0.14em] opacity-70">
            Actual start
          </span>
          <span>{formatDateTimeLabel(last.scheduledStart)}</span>
        </div>
      </div>
      {!last.scheduledOnRequestedDate ? (
        <p className="mt-3 rounded-xl border border-amber-300/35 bg-amber-300/12 px-3 py-2 text-xs text-amber-100">
          No capacity was available on the requested day. This order starts on{" "}
          {formatDateLabel(last.scheduledStart)}.
        </p>
      ) : (
        <p className="mt-3 rounded-xl border border-emerald-300/25 bg-emerald-300/10 px-3 py-2 text-xs text-emerald-100">
          Capacity was available on the requested day.
        </p>
      )}
    </div>
  );
}

function formatDateLabel(value: string): string {
  const date = parseLocalDate(value);
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(date);
}

function formatDateTimeLabel(value: string): string {
  const date = parseLocalDate(value);
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function parseLocalDate(value: string): Date {
  const dateOnlyMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (dateOnlyMatch) {
    const [, year, month, day] = dateOnlyMatch;
    return new Date(Number(year), Number(month) - 1, Number(day));
  }
  return new Date(value);
}
