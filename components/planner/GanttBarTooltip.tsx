"use client";

import { createPortal } from "react-dom";

import type { PositionedAssignment } from "@/lib/plannerViewModel";

type Variant = "task" | "order";

type GanttBarTooltipProps = {
  anchorRect: DOMRect | null;
  assignment: PositionedAssignment;
  variant: Variant;
  color: string;
  // For umbrella (order) tooltips:
  orderSummary?: {
    totalHours: number;
    taskCount: number;
    spanStart: Date;
    spanEnd: Date;
  };
};

const GAP = 8;
const TOOLTIP_WIDTH = 280;
const TOOLTIP_MAX_HEIGHT = 280;

export default function GanttBarTooltip({
  anchorRect,
  assignment,
  variant,
  color,
  orderSummary,
}: GanttBarTooltipProps) {
  if (!anchorRect || typeof document === "undefined") return null;

  const position = computePosition(anchorRect);

  return createPortal(
    <div
      role="tooltip"
      style={{
        top: position.top,
        left: position.left,
        width: TOOLTIP_WIDTH,
      }}
      className="pointer-events-none fixed z-[1000] rounded-xl border border-[var(--line)] bg-white px-3.5 py-3 text-[12px] leading-snug text-[var(--ink)] shadow-[0_12px_32px_-12px_rgba(15,15,15,0.25)]"
    >
      {variant === "task" ? (
        <TaskBody
          assignment={assignment}
          color={color}
          summary={orderSummary}
        />
      ) : (
        <OrderBody
          assignment={assignment}
          color={color}
          summary={orderSummary}
        />
      )}
    </div>,
    document.body,
  );
}

function computePosition(anchorRect: DOMRect): { top: number; left: number } {
  const viewportW = window.innerWidth;
  const viewportH = window.innerHeight;

  let left = anchorRect.left + anchorRect.width / 2 - TOOLTIP_WIDTH / 2;
  left = Math.max(8, Math.min(left, viewportW - TOOLTIP_WIDTH - 8));

  let top = anchorRect.bottom + GAP;
  if (top + TOOLTIP_MAX_HEIGHT > viewportH - 8) {
    top = anchorRect.top - TOOLTIP_MAX_HEIGHT - GAP;
  }
  if (top < 8) top = 8;

  return { top, left };
}

function TaskBody({
  assignment,
  color,
  summary,
}: {
  assignment: PositionedAssignment;
  color: string;
  summary?: GanttBarTooltipProps["orderSummary"];
}) {
  return (
    <>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.16em] text-[var(--muted)]">
            <span
              aria-hidden
              className="inline-block h-2 w-2 rounded-full"
              style={{ backgroundColor: color }}
            />
            <span className="truncate">Order</span>
          </p>
          <p className="mt-0.5 font-display text-base font-semibold leading-tight">
            {formatOrderPrimary(assignment)}
          </p>
          <p className="text-xs text-[var(--muted)]">
            {assignment.order_number}
          </p>
        </div>
        <StatusChip status={assignment.status} />
      </div>

      {summary ? (
        <dl className="mt-2.5 grid grid-cols-[auto_1fr] gap-x-2.5 gap-y-1 border-b border-[var(--line)] pb-2.5">
          <Row
            label="Tasks"
            value={`${summary.taskCount} stage${
              summary.taskCount === 1 ? "" : "s"
            }`}
          />
          <Row
            label="Order total"
            value={`${formatHours(summary.totalHours)}h`}
            mono
          />
          <Row label="Order start" value={formatDateTime(summary.spanStart)} mono />
          <Row label="Order end" value={formatDateTime(summary.spanEnd)} mono />
        </dl>
      ) : null}

      <dl className="mt-2.5 grid grid-cols-[auto_1fr] gap-x-2.5 gap-y-1">
        <Row label="Stage" value={assignment.stage} />
        <Row label="Worker" value={assignment.worker_name} />
        <Row
          label="Start"
          value={formatDateTime(assignment.startDate)}
          mono
        />
        <Row label="End" value={formatDateTime(assignment.endDate)} mono />
        <Row label="Hours" value={`${assignment.scheduled_hours}h`} mono />
      </dl>
    </>
  );
}

function OrderBody({
  assignment,
  color,
  summary,
}: {
  assignment: PositionedAssignment;
  color: string;
  summary?: GanttBarTooltipProps["orderSummary"];
}) {
  return (
    <>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.16em] text-[var(--muted)]">
            <span
              aria-hidden
              className="inline-block h-2 w-2 rounded-full"
              style={{ backgroundColor: color }}
            />
            <span className="truncate">Order</span>
          </p>
          <p className="mt-0.5 font-display text-base font-semibold leading-tight">
            {formatOrderPrimary(assignment)}
          </p>
          <p className="text-xs text-[var(--muted)]">
            {assignment.order_number}
          </p>
        </div>
      </div>

      {summary ? (
        <dl className="mt-2.5 grid grid-cols-[auto_1fr] gap-x-2.5 gap-y-1">
          <Row
            label="Tasks"
            value={`${summary.taskCount} stage${
              summary.taskCount === 1 ? "" : "s"
            }`}
          />
          <Row label="Total" value={`${formatHours(summary.totalHours)}h`} mono />
          <Row
            label="Start"
            value={formatDateTime(summary.spanStart)}
            mono
          />
          <Row label="End" value={formatDateTime(summary.spanEnd)} mono />
        </dl>
      ) : null}
    </>
  );
}

function formatOrderPrimary(assignment: PositionedAssignment): string {
  const customer = String(assignment.customer ?? "").trim();
  return customer
    ? `${assignment.baler_name} · ${customer}`
    : assignment.baler_name;
}

function Row({
  label,
  value,
  mono = false,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <>
      <dt className="text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--muted)]">
        {label}
      </dt>
      <dd
        className={`truncate text-[12px] text-[var(--ink)] ${
          mono ? "font-medium tabular-nums" : ""
        }`}
      >
        {value}
      </dd>
    </>
  );
}

function StatusChip({ status }: { status: string }) {
  return (
    <span className="shrink-0 rounded-full border border-[var(--line)] bg-[var(--panel-2)] px-2 py-0.5 text-[9px] font-bold uppercase tracking-[0.14em] text-[var(--muted)]">
      {status}
    </span>
  );
}

function formatDateTime(date: Date): string {
  return new Intl.DateTimeFormat("en-GB", {
    weekday: "short",
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function formatHours(value: number): string {
  if (Number.isInteger(value)) return String(value);
  return value.toFixed(1);
}
