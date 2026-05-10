"use client";

import type {
  OrderGanttRow,
  PositionedAssignment,
  WorkerGanttRow,
} from "@/lib/plannerViewModel";
import type { GanttAssignment, Id } from "@/types/planner";

type Selection =
  | { type: "assignment"; assignmentId: Id }
  | { type: "order"; orderId: Id }
  | { type: "worker"; workerId: Id }
  | null;

type SelectionDetailsProps = {
  selection: Selection;
  assignments: GanttAssignment[];
  orderRows: OrderGanttRow[];
  workerRows: WorkerGanttRow[];
  onClear: () => void;
};

export default function SelectionDetails({
  selection,
  assignments,
  orderRows,
  workerRows,
  onClear,
}: SelectionDetailsProps) {
  if (!selection) return null;

  if (selection.type === "assignment") {
    const assignment = assignments.find(
      (item) => String(item.assignment_id) === String(selection.assignmentId),
    );
    if (!assignment) {
      return <Empty onClear={onClear} message="Assignment not found." />;
    }
    return (
      <DetailFrame title="Assignment" onClear={onClear}>
        <Field label="Order" value={assignment.order_number} />
        <Field label="Baler" value={assignment.baler_name} />
        <Field label="Stage" value={assignment.stage} />
        <Field label="Worker" value={assignment.worker_name} />
        <Field label="Hours" value={`${assignment.scheduled_hours}h`} />
        <Field label="Start" value={formatDateTime(assignment.schedule_start)} />
        <Field label="End" value={formatDateTime(assignment.schedule_end)} />
        <Field label="Status" value={assignment.status} />
      </DetailFrame>
    );
  }

  if (selection.type === "order") {
    const row = orderRows.find(
      (item) => String(item.orderId) === String(selection.orderId),
    );
    if (!row) {
      return <Empty onClear={onClear} message="Order not found." />;
    }
    return (
      <DetailFrame title={`Order ${row.orderNumber}`} onClear={onClear}>
        <Field label="Baler" value={row.balerName} />
        <Field label="Start" value={formatDateTime(row.start)} />
        <Field label="End" value={formatDateTime(row.end)} />
        <Field label="Total hours" value={`${formatHours(row.totalHours)}h`} />
        <Field label="Stages" value={String(row.assignments.length)} />
        <Field
          label="Idle gap"
          value={
            row.idleGapHours > 0
              ? `${formatHours(row.idleGapHours)}h`
              : "None"
          }
        />
        <StageList assignments={row.assignments} />
      </DetailFrame>
    );
  }

  const row = workerRows.find(
    (item) => String(item.workerId) === String(selection.workerId),
  );
  if (!row) {
    return <Empty onClear={onClear} message="Worker not found." />;
  }

  const ordersForWorker = new Map<string, PositionedAssignment[]>();
  for (const assignment of row.assignments) {
    const key = assignment.order_number;
    const list = ordersForWorker.get(key) ?? [];
    list.push(assignment);
    ordersForWorker.set(key, list);
  }

  return (
    <DetailFrame title={row.workerName} onClear={onClear}>
      <Field label="Total hours" value={`${formatHours(row.totalHours)}h`} />
      <Field label="Assignments" value={String(row.assignmentCount)} />
      <div className="col-span-full mt-2">
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-[var(--muted)]">
          Orders
        </p>
        <ul className="mt-2 grid gap-1.5">
          {Array.from(ordersForWorker.entries()).map(([orderNumber, items]) => (
            <li
              key={orderNumber}
              className="flex items-center justify-between gap-3 rounded-xl border border-[var(--line)] bg-white px-3 py-2 text-sm"
            >
              <span className="font-semibold text-[var(--ink)]">
                {orderNumber}
              </span>
              <span className="text-[var(--muted)]">
                {items.length} stage{items.length === 1 ? "" : "s"} ·{" "}
                {formatHours(
                  items.reduce(
                    (acc, item) => acc + Number(item.scheduled_hours || 0),
                    0,
                  ),
                )}
                h
              </span>
            </li>
          ))}
        </ul>
      </div>
    </DetailFrame>
  );
}

function DetailFrame({
  title,
  onClear,
  children,
}: {
  title: string;
  onClear: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-start justify-between gap-3">
        <h3 className="font-display text-xl font-semibold text-[var(--ink)]">
          {title}
        </h3>
        <button
          type="button"
          onClick={onClear}
          className="rounded-full border border-[var(--line)] px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] text-[var(--muted)] hover:border-[var(--ink)] hover:text-[var(--ink)]"
        >
          Close
        </button>
      </div>
      <dl className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm md:grid-cols-3">
        {children}
      </dl>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col">
      <dt className="text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--muted)]">
        {label}
      </dt>
      <dd className="font-semibold text-[var(--ink)]">{value}</dd>
    </div>
  );
}

function StageList({ assignments }: { assignments: PositionedAssignment[] }) {
  return (
    <div className="col-span-full mt-2">
      <p className="text-xs font-bold uppercase tracking-[0.18em] text-[var(--muted)]">
        Stages
      </p>
      <ul className="mt-2 grid gap-1.5">
        {assignments.map((assignment) => (
          <li
            key={String(assignment.assignment_id)}
            className="flex items-center justify-between gap-3 rounded-xl border border-[var(--line)] bg-white px-3 py-2 text-sm"
          >
            <span className="font-semibold text-[var(--ink)]">
              {assignment.stage_order}. {assignment.stage}
            </span>
            <span className="text-[var(--muted)]">
              {assignment.worker_name} · {assignment.scheduled_hours}h
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Empty({ onClear, message }: { onClear: () => void; message: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <p className="text-sm text-[var(--muted)]">{message}</p>
      <button
        type="button"
        onClick={onClear}
        className="rounded-full border border-[var(--line)] px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] text-[var(--muted)]"
      >
        Close
      </button>
    </div>
  );
}

function formatDateTime(value: string | Date): string {
  const date = typeof value === "string" ? new Date(value) : value;
  return new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function formatHours(value: number): string {
  if (Number.isInteger(value)) return String(value);
  return value.toFixed(1);
}
