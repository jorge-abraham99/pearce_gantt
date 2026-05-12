"use client";

import { useMemo } from "react";

import GanttBar from "@/components/planner/GanttBar";
import GanttViewport, {
  ORDER_ROW_HEIGHT,
  ORDER_TASK_ROW_HEIGHT,
  type LabelColumn,
} from "@/components/planner/GanttViewport";
import {
  buildOrderDisplayRows,
  colorForKey,
} from "@/lib/plannerViewModel";
import type {
  DisplayRow,
  OrderGanttRow,
  TimelineModel,
  TimelineScale,
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
  scale: TimelineScale;
  onScaleChange: (scale: TimelineScale) => void;
  onSelectAssignment: (assignmentId: Id) => void;
  onSelectOrder: (orderId: Id) => void;
};

const COLUMNS: LabelColumn[] = [
  { key: "label", header: "Order / Task", width: 220 },
  { key: "worker", header: "Worker", width: 140 },
  { key: "start", header: "Start", width: 120 },
  { key: "end", header: "End", width: 120 },
];

export default function OrderGanttView({
  rows,
  timeline,
  selection,
  scale,
  onScaleChange,
  onSelectAssignment,
  onSelectOrder,
}: OrderGanttViewProps) {
  const displayRows = useMemo(() => buildOrderDisplayRows(rows), [rows]);

  const isRowSelected = (index: number): boolean => {
    const row = displayRows[index];
    if (!selection) return false;
    if (row.kind === "order") {
      if (selection.type === "order") {
        return String(selection.orderId) === String(row.order.orderId);
      }
      return false;
    }
    if (selection.type === "assignment") {
      return (
        String(selection.assignmentId) === String(row.assignment.assignment_id)
      );
    }
    return false;
  };

  const isRowHighlighted = (index: number): boolean => {
    const row = displayRows[index];
    if (!selection) return false;
    const orderId =
      row.kind === "order" ? row.order.orderId : row.orderId;
    if (selection.type === "order") {
      return String(selection.orderId) === String(orderId);
    }
    if (selection.type === "assignment") {
      const owner = rows.find((r) =>
        r.assignments.some(
          (a) => String(a.assignment_id) === String(selection.assignmentId),
        ),
      );
      return owner ? String(owner.orderId) === String(orderId) : false;
    }
    return false;
  };

  return (
    <GanttViewport
      timeline={timeline}
      rowCount={displayRows.length}
      rowHeight={(index) =>
        displayRows[index].kind === "order"
          ? ORDER_ROW_HEIGHT
          : ORDER_TASK_ROW_HEIGHT
      }
      columns={COLUMNS}
      headerExtra={
        <ScaleToggle scale={scale} onChange={onScaleChange} />
      }
      onRowClick={(index) => {
        const row = displayRows[index];
        if (row.kind === "order") {
          onSelectOrder(row.order.orderId);
        } else {
          onSelectAssignment(row.assignment.assignment_id);
        }
      }}
      isRowSelected={isRowSelected}
      isRowHighlighted={isRowHighlighted}
      rowClassName={(index) =>
        displayRows[index].kind === "order"
          ? "bg-[color:rgba(248,243,236,0.6)]"
          : ""
      }
      renderRowCell={(index, columnKey) =>
        renderCell(displayRows[index], columnKey)
      }
      renderRowBars={(index) => renderBars(displayRows[index], selection)}
      emptyState={<EmptyState />}
    />
  );

  function renderBars(row: DisplayRow, current: Selection) {
    if (row.kind === "order") {
      const order = row.order;
      if (order.assignments.length === 0) return null;
      const earliest = order.assignments.reduce((acc, item) =>
        item.startDate.getTime() < acc.startDate.getTime() ? item : acc,
      );
      const latest = order.assignments.reduce((acc, item) =>
        item.endDate.getTime() > acc.endDate.getTime() ? item : acc,
      );
      const leftPct = earliest.leftPct;
      const widthPct = Math.max(
        0.6,
        latest.leftPct + latest.widthPct - earliest.leftPct,
      );
      const umbrella = {
        ...earliest,
        leftPct,
        widthPct,
        endDate: latest.endDate,
      };
      const isSelected =
        current?.type === "order" &&
        String(current.orderId) === String(order.orderId);
      return (
        <GanttBar
          assignment={umbrella}
          color={colorForKey(order.orderId)}
          variant="umbrella"
          showLabels={false}
          isSelected={isSelected}
          onSelect={() => onSelectOrder(order.orderId)}
          rowHeight={ORDER_ROW_HEIGHT}
        />
      );
    }

    const { assignment, orderId } = row;
    const isSelected =
      current?.type === "assignment" &&
      String(current.assignmentId) === String(assignment.assignment_id);
    return (
      <GanttBar
        assignment={assignment}
        color={colorForKey(orderId)}
        showLabels={false}
        isSelected={isSelected}
        onSelect={() => onSelectAssignment(assignment.assignment_id)}
        rowHeight={ORDER_TASK_ROW_HEIGHT}
      />
    );
  }
}

function renderCell(row: DisplayRow, columnKey: string) {
  if (row.kind === "order") {
    const order = row.order;
    if (columnKey === "label") {
      const idleText =
        order.idleGapHours >= 1
          ? ` · ${formatHours(order.idleGapHours)}h idle`
          : "";
      return (
        <div className="flex flex-col">
          <span className="font-display text-base font-semibold text-[var(--ink)]">
            {order.orderNumber}
          </span>
          <span className="text-xs text-[var(--muted)]">
            {order.balerName} · {formatHours(order.totalHours)}h{idleText}
          </span>
        </div>
      );
    }
    if (columnKey === "worker") {
      return (
        <span className="text-xs text-[var(--muted)]">
          {order.assignments.length} task
          {order.assignments.length === 1 ? "" : "s"}
        </span>
      );
    }
    if (columnKey === "start") {
      return (
        <span className="text-xs text-[var(--muted)]">
          {formatShortDateTime(order.start)}
        </span>
      );
    }
    if (columnKey === "end") {
      return (
        <span className="text-xs text-[var(--muted)]">
          {formatShortDateTime(order.end)}
        </span>
      );
    }
    return null;
  }

  const assignment = row.assignment;
  if (columnKey === "label") {
    return (
      <div className="flex items-center gap-2 pl-2">
        <span className="h-3 w-[3px] rounded-full bg-[var(--line)]" />
        <span className="truncate text-sm font-medium text-[var(--ink)]">
          {assignment.stage}
        </span>
      </div>
    );
  }
  if (columnKey === "worker") {
    return (
      <span className="truncate text-sm text-[var(--ink)]">
        {assignment.worker_name}
      </span>
    );
  }
  if (columnKey === "start") {
    return (
      <span className="text-xs text-[var(--ink)]">
        {formatShortDateTime(assignment.startDate)}
      </span>
    );
  }
  if (columnKey === "end") {
    return (
      <span className="text-xs text-[var(--ink)]">
        {formatShortDateTime(assignment.endDate)}
      </span>
    );
  }
  return null;
}

function ScaleToggle({
  scale,
  onChange,
}: {
  scale: TimelineScale;
  onChange: (scale: TimelineScale) => void;
}) {
  return (
    <div
      role="tablist"
      aria-label="Timeline scale"
      className="flex items-center rounded-full border border-[var(--line)] bg-white p-0.5 text-[10px] font-bold uppercase tracking-[0.18em] shadow-sm"
    >
      <ScaleTab
        label="Day"
        isSelected={scale === "day"}
        onClick={() => onChange("day")}
      />
      <ScaleTab
        label="Week"
        isSelected={scale === "week"}
        onClick={() => onChange("week")}
      />
    </div>
  );
}

function ScaleTab({
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
      className={`rounded-full px-3 py-1 transition ${
        isSelected
          ? "bg-[var(--ink)] text-white"
          : "text-[var(--muted)] hover:text-[var(--ink)]"
      }`}
    >
      {label}
    </button>
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

function formatShortDateTime(date: Date): string {
  return new Intl.DateTimeFormat("en-GB", {
    weekday: "short",
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}
