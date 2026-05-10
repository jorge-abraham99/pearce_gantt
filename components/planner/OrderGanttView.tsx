"use client";

import GanttBar from "@/components/planner/GanttBar";
import GanttViewport, {
  ORDER_ROW_HEIGHT,
} from "@/components/planner/GanttViewport";
import { colorForKey } from "@/lib/plannerViewModel";
import type {
  OrderGanttRow,
  TimelineModel,
} from "@/lib/plannerViewModel";
import type { Id } from "@/types/planner";

type Selection =
  | { type: "assignment"; assignmentId: Id }
  | { type: "order"; orderId: Id }
  | { type: "worker"; workerId: Id }
  | null;

type OrderGanttViewProps = {
  rows: OrderGanttRow[];
  timeline: TimelineModel;
  selection: Selection;
  onSelectAssignment: (assignmentId: Id) => void;
  onSelectOrder: (orderId: Id) => void;
};

export default function OrderGanttView({
  rows,
  timeline,
  selection,
  onSelectAssignment,
  onSelectOrder,
}: OrderGanttViewProps) {
  return (
    <GanttViewport
      timeline={timeline}
      rowCount={rows.length}
      rowHeight={ORDER_ROW_HEIGHT}
      labelHeader="Order"
      onRowClick={(index) => onSelectOrder(rows[index].orderId)}
      isRowSelected={(index) => {
        const row = rows[index];
        if (selection?.type === "order") {
          return String(selection.orderId) === String(row.orderId);
        }
        if (selection?.type === "assignment") {
          return row.assignments.some(
            (assignment) =>
              String(assignment.assignment_id) === String(selection.assignmentId),
          );
        }
        return false;
      }}
      renderRowLabel={(index) => {
        const row = rows[index];
        const idleText =
          row.idleGapHours >= 1
            ? ` · ${formatHours(row.idleGapHours)}h idle`
            : "";
        return (
          <div className="flex flex-col">
            <span className="font-display text-base font-semibold text-[var(--ink)]">
              {row.orderNumber}
            </span>
            <span className="text-xs text-[var(--muted)]">
              {row.balerName} · {formatHours(row.totalHours)}h{idleText}
            </span>
          </div>
        );
      }}
      renderRowBars={(index) => {
        const row = rows[index];
        return row.assignments.map((assignment) => {
          const isSelected =
            selection?.type === "assignment" &&
            String(selection.assignmentId) === String(assignment.assignment_id);
          return (
            <GanttBar
              key={String(assignment.assignment_id)}
              assignment={assignment}
              color={colorForKey(assignment.stage)}
              labelTop={assignment.stage}
              labelBottom={`${assignment.worker_name} · ${assignment.scheduled_hours}h`}
              isSelected={isSelected}
              onSelect={() => onSelectAssignment(assignment.assignment_id)}
              rowHeight={ORDER_ROW_HEIGHT}
            />
          );
        });
      }}
      emptyState={<EmptyState />}
    />
  );
}

function EmptyState() {
  return (
    <div className="rounded-3xl border border-dashed border-[var(--line)] bg-white/60 p-10 text-center">
      <p className="font-display text-2xl font-semibold">No orders to show.</p>
      <p className="mt-2 text-[var(--muted)]">
        Schedule an order to see it here.
      </p>
    </div>
  );
}

function formatHours(value: number): string {
  if (Number.isInteger(value)) return String(value);
  return value.toFixed(1);
}
