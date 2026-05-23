import { getBankHolidayByDateKey } from "@/lib/bankHolidays";
import type { GanttAssignment } from "@/types/planner";

export type PlannerView = "orders" | "workers";

export type TimelineScale = "day" | "week" | "month";

export type PlannerFilters = {
  orderNumber: string;
  customer: string;
  task: string;
};

export type TimelineDay = {
  date: Date;
  iso: string;
  label: string;
  isWeekend: boolean;
  isToday: boolean;
  isBankHoliday: boolean;
  bankHolidayTitle: string | null;
};

export type TimelineUnit = {
  start: Date;
  end: Date;
  iso: string;
  label: string;
  subLabel: string;
  isCurrent: boolean;
  isWeekend: boolean;
  isBankHoliday: boolean;
  bankHolidayTitles: string[];
};

export type TimelineModel = {
  start: Date;
  end: Date;
  scale: TimelineScale;
  days: TimelineDay[];
  totalDays: number;
  units: TimelineUnit[];
};

export type DisplayRow =
  | { kind: "order"; order: OrderGanttRow }
  | {
      kind: "task";
      orderId: GanttAssignment["order_id"];
      assignment: PositionedAssignment;
    };

export type PositionedAssignment = GanttAssignment & {
  leftPct: number;
  widthPct: number;
  startDate: Date;
  endDate: Date;
};

export type OrderGanttRow = {
  orderId: GanttAssignment["order_id"];
  orderNumber: string;
  customer: string | null;
  balerName: string;
  start: Date;
  end: Date;
  totalHours: number;
  idleGapHours: number;
  longestStageHours: number;
  assignments: PositionedAssignment[];
};

export type WorkerGanttRow = {
  workerId: GanttAssignment["worker_id"];
  workerName: string;
  totalHours: number;
  assignmentCount: number;
  assignments: PositionedAssignment[];
};

export type PlannerStats = {
  orderCount: number;
  assignmentCount: number;
  scheduledHours: number;
  workerCount: number;
  longestOrder?: {
    orderId: GanttAssignment["order_id"];
    orderNumber: string;
    durationDays: number;
  };
  largestIdleGap?: {
    orderId: GanttAssignment["order_id"];
    orderNumber: string;
    idleGapHours: number;
  };
  busiestWorker?: {
    workerId: GanttAssignment["worker_id"];
    workerName: string;
    totalHours: number;
  };
};

const DAY_MS = 24 * 60 * 60 * 1000;
const MIN_BAR_WIDTH_PCT = 0.6;

function startOfDay(date: Date): Date {
  const next = new Date(date);
  next.setHours(0, 0, 0, 0);
  return next;
}

function endOfDay(date: Date): Date {
  const next = new Date(date);
  next.setHours(23, 59, 59, 999);
  return next;
}

function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function addMonths(date: Date, months: number): Date {
  const next = new Date(date);
  next.setMonth(next.getMonth() + months);
  return next;
}

function isSameYMD(left: Date, right: Date): boolean {
  return (
    left.getFullYear() === right.getFullYear() &&
    left.getMonth() === right.getMonth() &&
    left.getDate() === right.getDate()
  );
}

function isSameYM(left: Date, right: Date): boolean {
  return (
    left.getFullYear() === right.getFullYear() &&
    left.getMonth() === right.getMonth()
  );
}

function toHours(value: GanttAssignment["scheduled_hours"]): number {
  const num = typeof value === "number" ? value : Number(value);
  return Number.isFinite(num) ? num : 0;
}

function formatDayLabel(date: Date): string {
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
  }).format(date);
}

function isoDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function isoMonthKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  return `${year}-${month}`;
}

function startOfWeek(date: Date): Date {
  const next = startOfDay(date);
  const day = next.getDay();
  // ISO weeks start on Monday (day 1). Sunday = 0 → roll back 6 days.
  const offset = day === 0 ? 6 : day - 1;
  next.setDate(next.getDate() - offset);
  return next;
}

function startOfMonth(date: Date): Date {
  return startOfDay(new Date(date.getFullYear(), date.getMonth(), 1));
}

function endOfMonth(date: Date): Date {
  return endOfDay(new Date(date.getFullYear(), date.getMonth() + 1, 0));
}

function isoWeekNumber(date: Date): number {
  const target = new Date(
    Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()),
  );
  const dayNum = target.getUTCDay() || 7;
  target.setUTCDate(target.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(target.getUTCFullYear(), 0, 1));
  return Math.ceil(
    ((target.getTime() - yearStart.getTime()) / DAY_MS + 1) / 7,
  );
}

function formatWeekSubLabel(date: Date): string {
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
  }).format(date);
}

function formatMonthLabel(date: Date): string {
  return new Intl.DateTimeFormat("en-GB", { month: "short" }).format(date);
}

export function filterAssignments(
  assignments: GanttAssignment[],
  filters: PlannerFilters,
): GanttAssignment[] {
  const orderNumber = filters.orderNumber.trim().toLowerCase();
  const customer = filters.customer.trim().toLowerCase();
  const task = filters.task.trim().toLowerCase();

  if (!orderNumber && !customer && !task) return assignments;

  return assignments.filter((assignment) => {
    const assignmentOrder = String(assignment.order_number ?? "")
      .trim()
      .toLowerCase();
    const assignmentCustomer = String(assignment.customer ?? "")
      .trim()
      .toLowerCase();
    const assignmentTask = String(assignment.stage ?? "").trim().toLowerCase();

    return (
      (!orderNumber || assignmentOrder.includes(orderNumber)) &&
      (!customer || assignmentCustomer === customer) &&
      (!task || assignmentTask === task)
    );
  });
}

export function buildTimeline(
  assignments: GanttAssignment[],
  scale: TimelineScale = "day",
): TimelineModel {
  const today = startOfDay(new Date());

  let rangeStart: Date;
  let rangeEnd: Date;

  if (assignments.length === 0) {
    rangeStart = today;
    rangeEnd = endOfDay(addDays(today, 13));
  } else {
    let minStart = Number.POSITIVE_INFINITY;
    let maxEnd = Number.NEGATIVE_INFINITY;
    for (const assignment of assignments) {
      const startMs = new Date(assignment.schedule_start).getTime();
      const endMs = new Date(assignment.schedule_end).getTime();
      if (Number.isFinite(startMs)) minStart = Math.min(minStart, startMs);
      if (Number.isFinite(endMs)) maxEnd = Math.max(maxEnd, endMs);
    }

    if (!Number.isFinite(minStart) || !Number.isFinite(maxEnd)) {
      rangeStart = today;
      rangeEnd = endOfDay(addDays(today, 13));
    } else {
      rangeStart = startOfDay(addDays(new Date(minStart), -1));
      rangeEnd = endOfDay(addDays(new Date(maxEnd), 1));
    }
  }

  if (scale === "week") {
    rangeStart = startOfWeek(rangeStart);
    const lastWeekStart = startOfWeek(rangeEnd);
    rangeEnd = endOfDay(addDays(lastWeekStart, 6));
  } else if (scale === "month") {
    rangeStart = startOfMonth(rangeStart);
    rangeEnd = endOfMonth(rangeEnd);
  }

  const totalMs = rangeEnd.getTime() - rangeStart.getTime();
  const totalDays = Math.max(1, Math.ceil(totalMs / DAY_MS));

  const days: TimelineDay[] = [];
  for (let index = 0; index < totalDays; index += 1) {
    const date = addDays(rangeStart, index);
    const day = date.getDay();
    const iso = isoDateKey(date);
    const bankHoliday = getBankHolidayByDateKey(iso);
    days.push({
      date,
      iso,
      label: formatDayLabel(date),
      isWeekend: day === 0 || day === 6,
      isToday: isSameYMD(date, today),
      isBankHoliday: bankHoliday !== null,
      bankHolidayTitle: bankHoliday?.title ?? null,
    });
  }

  const units: TimelineUnit[] = [];
  if (scale === "day") {
    for (const day of days) {
      units.push({
        start: day.date,
        end: endOfDay(day.date),
        iso: day.iso,
        label: day.label,
        subLabel: new Intl.DateTimeFormat("en-GB", { weekday: "short" }).format(
          day.date,
        ),
        isCurrent: day.isToday,
        isWeekend: day.isWeekend,
        isBankHoliday: day.isBankHoliday,
        bankHolidayTitles: day.bankHolidayTitle ? [day.bankHolidayTitle] : [],
      });
    }
  } else if (scale === "week") {
    const todayWeekStart = startOfWeek(today);
    let cursor = startOfWeek(rangeStart);
    while (cursor.getTime() < rangeEnd.getTime()) {
      const weekEnd = endOfDay(addDays(cursor, 6));
      const bankHolidayTitles = getBankHolidayTitlesForRange(days, cursor, weekEnd);
      units.push({
        start: new Date(cursor),
        end: weekEnd,
        iso: isoDateKey(cursor),
        label: `Wk ${isoWeekNumber(cursor)}`,
        subLabel: formatWeekSubLabel(cursor),
        isCurrent: isSameYMD(cursor, todayWeekStart),
        isWeekend: false,
        isBankHoliday: bankHolidayTitles.length > 0,
        bankHolidayTitles,
      });
      cursor = addDays(cursor, 7);
    }
  } else {
    const todayMonthStart = startOfMonth(today);
    let cursor = startOfMonth(rangeStart);
    while (cursor.getTime() < rangeEnd.getTime()) {
      const monthEnd = endOfMonth(cursor);
      const bankHolidayTitles = getBankHolidayTitlesForRange(days, cursor, monthEnd);
      units.push({
        start: new Date(cursor),
        end: monthEnd,
        iso: isoMonthKey(cursor),
        label: formatMonthLabel(cursor),
        subLabel: String(cursor.getFullYear()),
        isCurrent: isSameYM(cursor, todayMonthStart),
        isWeekend: false,
        isBankHoliday: bankHolidayTitles.length > 0,
        bankHolidayTitles,
      });
      cursor = addMonths(cursor, 1);
    }
  }

  return {
    start: rangeStart,
    end: rangeEnd,
    scale,
    days,
    totalDays,
    units,
  };
}

function getBankHolidayTitlesForRange(
  days: TimelineDay[],
  start: Date,
  end: Date,
): string[] {
  return days
    .filter(
      (day) =>
        day.bankHolidayTitle !== null &&
        day.date.getTime() >= start.getTime() &&
        day.date.getTime() <= end.getTime(),
    )
    .map((day) => day.bankHolidayTitle as string);
}

export function positionAssignment(
  assignment: GanttAssignment,
  timeline: TimelineModel,
): PositionedAssignment {
  const startDate = new Date(assignment.schedule_start);
  const endDate = new Date(assignment.schedule_end);
  const totalMs = timeline.end.getTime() - timeline.start.getTime();

  const safeTotalMs = totalMs > 0 ? totalMs : DAY_MS;
  const offsetMs = startDate.getTime() - timeline.start.getTime();
  const durationMs = Math.max(0, endDate.getTime() - startDate.getTime());

  const leftPct = Math.max(0, Math.min(100, (offsetMs / safeTotalMs) * 100));
  const rawWidthPct = (durationMs / safeTotalMs) * 100;
  const widthPct = Math.max(MIN_BAR_WIDTH_PCT, Math.min(100 - leftPct, rawWidthPct));

  return {
    ...assignment,
    leftPct,
    widthPct,
    startDate,
    endDate,
  };
}

export function buildOrderRows(
  assignments: GanttAssignment[],
  scale: TimelineScale = "day",
): OrderGanttRow[] {
  const timeline = buildTimeline(assignments, scale);
  const grouped = new Map<string, GanttAssignment[]>();

  for (const assignment of assignments) {
    const key = String(assignment.order_id);
    const list = grouped.get(key) ?? [];
    list.push(assignment);
    grouped.set(key, list);
  }

  const rows: OrderGanttRow[] = [];
  for (const [, group] of grouped) {
    const sorted = [...group].sort((left, right) => {
      if (left.stage_order !== right.stage_order) {
        return left.stage_order - right.stage_order;
      }
      return (
        new Date(left.schedule_start).getTime() -
        new Date(right.schedule_start).getTime()
      );
    });

    const positioned = sorted.map((item) => positionAssignment(item, timeline));

    let totalHours = 0;
    let longestStageHours = 0;
    for (const item of positioned) {
      const hours = toHours(item.scheduled_hours);
      totalHours += hours;
      if (hours > longestStageHours) longestStageHours = hours;
    }

    let idleGapHours = 0;
    const byStart = [...positioned].sort(
      (left, right) => left.startDate.getTime() - right.startDate.getTime(),
    );
    for (let index = 1; index < byStart.length; index += 1) {
      const previous = byStart[index - 1];
      const current = byStart[index];
      const gapMs = current.startDate.getTime() - previous.endDate.getTime();
      if (gapMs > 0) {
        idleGapHours += gapMs / (60 * 60 * 1000);
      }
    }

    const startDate = byStart.length
      ? byStart[0].startDate
      : new Date(sorted[0].schedule_start);
    const endDate = byStart.reduce<Date>(
      (acc, item) => (item.endDate.getTime() > acc.getTime() ? item.endDate : acc),
      new Date(sorted[0].schedule_end),
    );

    const head = sorted[0];
    rows.push({
      orderId: head.order_id,
      orderNumber: head.order_number,
      customer: head.customer,
      balerName: head.baler_name,
      start: startDate,
      end: endDate,
      totalHours,
      idleGapHours,
      longestStageHours,
      assignments: positioned,
    });
  }

  rows.sort((left, right) => left.start.getTime() - right.start.getTime());
  return rows;
}

export function buildWorkerRows(
  assignments: GanttAssignment[],
  scale: TimelineScale = "day",
): WorkerGanttRow[] {
  const timeline = buildTimeline(assignments, scale);
  const grouped = new Map<string, GanttAssignment[]>();

  for (const assignment of assignments) {
    const key = String(assignment.worker_id);
    const list = grouped.get(key) ?? [];
    list.push(assignment);
    grouped.set(key, list);
  }

  const rows: WorkerGanttRow[] = [];
  for (const [, group] of grouped) {
    const sorted = [...group].sort(
      (left, right) =>
        new Date(left.schedule_start).getTime() -
        new Date(right.schedule_start).getTime(),
    );

    const positioned = sorted.map((item) => positionAssignment(item, timeline));
    let totalHours = 0;
    for (const item of positioned) {
      totalHours += toHours(item.scheduled_hours);
    }

    const head = sorted[0];
    rows.push({
      workerId: head.worker_id,
      workerName: head.worker_name,
      totalHours,
      assignmentCount: positioned.length,
      assignments: positioned,
    });
  }

  rows.sort((left, right) => left.workerName.localeCompare(right.workerName));
  return rows;
}

export function buildPlannerStats(assignments: GanttAssignment[]): PlannerStats {
  const orderIds = new Set<string>();
  const workerIds = new Set<string>();
  let scheduledHours = 0;

  for (const assignment of assignments) {
    orderIds.add(String(assignment.order_id));
    workerIds.add(String(assignment.worker_id));
    scheduledHours += toHours(assignment.scheduled_hours);
  }

  const stats: PlannerStats = {
    orderCount: orderIds.size,
    assignmentCount: assignments.length,
    scheduledHours,
    workerCount: workerIds.size,
  };

  if (assignments.length === 0) {
    return stats;
  }

  const orderRows = buildOrderRows(assignments);
  const workerRows = buildWorkerRows(assignments);

  let longestRow: OrderGanttRow | undefined;
  let longestDurationMs = -1;
  let largestGapRow: OrderGanttRow | undefined;
  for (const row of orderRows) {
    const durationMs = row.end.getTime() - row.start.getTime();
    if (durationMs > longestDurationMs) {
      longestDurationMs = durationMs;
      longestRow = row;
    }
    if (
      row.idleGapHours > 0 &&
      (!largestGapRow || row.idleGapHours > largestGapRow.idleGapHours)
    ) {
      largestGapRow = row;
    }
  }

  if (longestRow) {
    stats.longestOrder = {
      orderId: longestRow.orderId,
      orderNumber: longestRow.orderNumber,
      durationDays: Math.max(
        0,
        Math.round((longestDurationMs / DAY_MS) * 10) / 10,
      ),
    };
  }

  if (largestGapRow) {
    stats.largestIdleGap = {
      orderId: largestGapRow.orderId,
      orderNumber: largestGapRow.orderNumber,
      idleGapHours: Math.round(largestGapRow.idleGapHours * 10) / 10,
    };
  }

  let busiestWorker: WorkerGanttRow | undefined;
  for (const row of workerRows) {
    if (!busiestWorker || row.totalHours > busiestWorker.totalHours) {
      busiestWorker = row;
    }
  }

  if (busiestWorker) {
    stats.busiestWorker = {
      workerId: busiestWorker.workerId,
      workerName: busiestWorker.workerName,
      totalHours: Math.round(busiestWorker.totalHours * 10) / 10,
    };
  }

  return stats;
}

const PALETTE = [
  "#2f6fd6",
  "#c4542d",
  "#29706c",
  "#7a4ec4",
  "#b8861a",
  "#297038",
];

export function colorForKey(key: string | number): string {
  const text = String(key);
  let hash = 0;
  for (let i = 0; i < text.length; i += 1) {
    hash = (hash * 31 + text.charCodeAt(i)) >>> 0;
  }
  return PALETTE[hash % PALETTE.length];
}

export function buildOrderDisplayRows(rows: OrderGanttRow[]): DisplayRow[] {
  const out: DisplayRow[] = [];
  for (const order of rows) {
    out.push({ kind: "order", order });
    for (const assignment of order.assignments) {
      out.push({ kind: "task", orderId: order.orderId, assignment });
    }
  }
  return out;
}
