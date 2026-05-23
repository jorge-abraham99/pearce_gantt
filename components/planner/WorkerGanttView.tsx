"use client";

import { useMemo } from "react";

import GanttBar from "@/components/planner/GanttBar";
import GanttViewport, {
  WORKER_ROW_HEIGHT,
  type LabelColumn,
} from "@/components/planner/GanttViewport";
import { colorForKey, WORKER_SKILL_ORDER } from "@/lib/plannerViewModel";
import type {
  TimelineModel,
  WorkerGanttRow,
  WorkerSkillGroup,
} from "@/lib/plannerViewModel";
import type { Id } from "@/types/planner";

function workerInitials(name: string): string {
  return name
    .split(" ")
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");
}

type Selection =
  | { type: "assignment"; assignmentId: Id }
  | { type: "order"; orderId: Id }
  | { type: "worker"; workerId: Id }
  | null;

type OrderSummary = {
  totalHours: number;
  taskCount: number;
  spanStart: Date;
  spanEnd: Date;
};

type WorkerGanttViewProps = {
  rows: WorkerGanttRow[];
  timeline: TimelineModel;
  selection: Selection;
  highlightedOrderId: Id | null;
  orderSummariesById: Map<string, OrderSummary>;
  onSelectAssignment: (assignmentId: Id) => void;
  onSelectWorker: (workerId: Id) => void;
};

const COLUMNS: LabelColumn[] = [
  { key: "worker", header: "Worker", width: 240 },
];

const SKILL_HEADER_HEIGHT = 30;

const SKILL_COLORS: Record<WorkerSkillGroup, string> = {
  Pressing: "#7a4ec4",
  Welding: "#c4542d",
  Assembling: "#29706c",
  Spraying: "#2f6fd6",
  Other: "var(--muted)",
};

type WorkerDisplayRow =
  | {
      kind: "skill";
      skill: WorkerSkillGroup;
      workerCount: number;
      isFirst: boolean;
    }
  | { kind: "worker"; row: WorkerGanttRow };

export default function WorkerGanttView({
  rows,
  timeline,
  selection,
  highlightedOrderId,
  orderSummariesById,
  onSelectAssignment,
  onSelectWorker,
}: WorkerGanttViewProps) {
  const displayRows = useMemo(() => buildDisplayRows(rows), [rows]);

  return (
    <GanttViewport
      timeline={timeline}
      rowCount={displayRows.length}
      rowHeight={(index) =>
        displayRows[index].kind === "skill"
          ? SKILL_HEADER_HEIGHT
          : WORKER_ROW_HEIGHT
      }
      columns={COLUMNS}
      onRowClick={(index) => {
        const item = displayRows[index];
        if (item.kind === "worker") onSelectWorker(item.row.workerId);
      }}
      isRowInteractive={(index) => displayRows[index].kind === "worker"}
      isRowSelected={(index) => {
        const item = displayRows[index];
        if (item.kind === "skill") return false;
        const { row } = item;
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
      isRowHighlighted={(index) => {
        const item = displayRows[index];
        if (item.kind === "skill") return true;
        return (
          highlightedOrderId !== null &&
          item.row.assignments.some(
            (assignment) =>
              String(assignment.order_id) === String(highlightedOrderId),
          )
        );
      }}
      rowClassName={(index) => {
        const item = displayRows[index];
        return item.kind === "skill" && !item.isFirst
          ? "border-t border-[var(--line)]"
          : "";
      }}
      rowTimelineBackground={(index, defaultBackground) =>
        displayRows[index].kind === "skill"
          ? "var(--panel-2)"
          : defaultBackground
      }
      renderRowCell={(index, columnKey) => {
        if (columnKey !== "worker") return null;
        const item = displayRows[index];
        if (item.kind === "skill") {
          return (
            <SkillHeader
              skill={item.skill}
              workerCount={item.workerCount}
            />
          );
        }
        const { row } = item;
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
        const item = displayRows[index];
        if (item.kind === "skill") return null;
        const { row } = item;
        return row.assignments.map((assignment) => {
          const isSelected =
            selection?.type === "assignment" &&
            String(selection.assignmentId) === String(assignment.assignment_id);
          const isHighlighted =
            highlightedOrderId !== null &&
            String(assignment.order_id) === String(highlightedOrderId);
          const orderSummary = orderSummariesById.get(
            String(assignment.order_id),
          );
          return (
            <GanttBar
              key={String(assignment.assignment_id)}
              assignment={assignment}
              color={colorForKey(assignment.order_id)}
              labelTop={assignment.order_number}
              labelBottom={`${assignment.stage} · ${assignment.scheduled_hours}h`}
              showLabels={false}
              orderSummary={orderSummary}
              showOrderSummaryInTooltip={false}
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

function buildDisplayRows(rows: WorkerGanttRow[]): WorkerDisplayRow[] {
  const groups = new Map<WorkerSkillGroup, WorkerGanttRow[]>();
  for (const row of rows) {
    const group = groups.get(row.primarySkill) ?? [];
    group.push(row);
    groups.set(row.primarySkill, group);
  }

  const displayRows: WorkerDisplayRow[] = [];
  for (const skill of WORKER_SKILL_ORDER) {
    const group = groups.get(skill);
    if (!group || group.length === 0) continue;
    displayRows.push({
      kind: "skill",
      skill,
      workerCount: group.length,
      isFirst: displayRows.length === 0,
    });
    for (const row of group) {
      displayRows.push({ kind: "worker", row });
    }
  }
  return displayRows;
}

function SkillHeader({
  skill,
  workerCount,
}: {
  skill: WorkerSkillGroup;
  workerCount: number;
}) {
  return (
    <div className="flex items-center gap-2">
      <span
        className="h-2.5 w-2.5 flex-shrink-0 rounded-[2px]"
        style={{ background: SKILL_COLORS[skill] }}
        aria-hidden
      />
      <span className="font-display text-[13px] font-bold text-[var(--ink)]">
        {skill}
      </span>
      <span className="ml-1 text-[10px] font-semibold tabular-nums text-[var(--muted)]">
        · {workerCount}
      </span>
    </div>
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
