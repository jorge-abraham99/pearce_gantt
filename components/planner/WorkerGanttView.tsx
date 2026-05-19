"use client";

import GanttBar from "@/components/planner/GanttBar";
import GanttViewport, {
  WORKER_ROW_HEIGHT,
  type LabelColumn,
} from "@/components/planner/GanttViewport";
import { colorForKey } from "@/lib/plannerViewModel";

function workerInitials(name: string): string {
  return name
    .split(" ")
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");
}
import type {
  TimelineModel,
  WorkerGanttRow,
} from "@/lib/plannerViewModel";
import type { Id } from "@/types/planner";

type Selection =
  | { type: "assignment"; assignmentId: Id }
  | { type: "order"; orderId: Id }
  | { type: "worker"; workerId: Id }
  | null;

type WorkerGanttViewProps = {
  rows: WorkerGanttRow[];
  timeline: TimelineModel;
  selection: Selection;
  highlightedOrderId: Id | null;
  onSelectAssignment: (assignmentId: Id) => void;
  onSelectWorker: (workerId: Id) => void;
};

const COLUMNS: LabelColumn[] = [
  { key: "worker", header: "Worker", width: 240 },
];

export default function WorkerGanttView({
  rows,
  timeline,
  selection,
  highlightedOrderId,
  onSelectAssignment,
  onSelectWorker,
}: WorkerGanttViewProps) {
  return (
    <GanttViewport
      timeline={timeline}
      rowCount={rows.length}
      rowHeight={WORKER_ROW_HEIGHT}
      columns={COLUMNS}
      onRowClick={(index) => onSelectWorker(rows[index].workerId)}
      isRowSelected={(index) => {
        const row = rows[index];
        if (selection?.type === "worker") {
          return String(selection.workerId) === String(row.workerId);
        }
        if (selection?.type === "assignment") {
          return row.assignments.some(
            (assignment) =>
              String(assignment.assignment_id) ===
              String(selection.assignmentId),
          );
        }
        return false;
      }}
      isRowHighlighted={(index) =>
        highlightedOrderId !== null &&
        rows[index].assignments.some(
          (assignment) =>
            String(assignment.order_id) === String(highlightedOrderId),
        )
      }
      renderRowCell={(index, columnKey) => {
        if (columnKey !== "worker") return null;
        const row = rows[index];
        return (
          <div className="flex items-center gap-3">
            <span
              className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full text-[11px] font-bold text-white"
              style={{ background: colorForKey(row.workerId) }}
              aria-hidden
            >
              {workerInitials(row.workerName)}
            </span>
            <div className="flex flex-col leading-tight">
              <span className="font-semibold text-[var(--ink)]">
                {row.workerName}
              </span>
              <span className="text-xs text-[var(--muted)]">
                {formatHours(row.totalHours)}h scheduled
              </span>
            </div>
          </div>
        );
      }}
      renderRowBars={(index) => {
        const row = rows[index];
        return row.assignments.map((assignment) => {
          const isSelected =
            selection?.type === "assignment" &&
            String(selection.assignmentId) === String(assignment.assignment_id);
          const isHighlighted =
            highlightedOrderId !== null &&
            String(assignment.order_id) === String(highlightedOrderId);
          return (
            <GanttBar
              key={String(assignment.assignment_id)}
              assignment={assignment}
              color={colorForKey(assignment.order_id)}
              labelTop={assignment.order_number}
              labelBottom={`${assignment.stage} · ${assignment.scheduled_hours}h`}
              showLabels={false}
              isSelected={isSelected}
              isHighlighted={isHighlighted}
              onSelect={() => onSelectAssignment(assignment.assignment_id)}
              rowHeight={WORKER_ROW_HEIGHT}
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
      <p className="font-display text-2xl font-semibold">No workers to show.</p>
      <p className="mt-2 text-[var(--muted)]">
        Schedule an order to populate worker assignments.
      </p>
    </div>
  );
}

function formatHours(value: number): string {
  if (Number.isInteger(value)) return String(value);
  return value.toFixed(1);
}
