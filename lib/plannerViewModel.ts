import type { GanttAssignment } from "@/types/planner";

export type PlannerView = "orders" | "workers";

export type TimelineDay = {
  date: Date;
  iso: string;
  label: string;
  isWeekend: boolean;
  isToday: boolean;
};

export type TimelineModel = {
  start: Date;
  end: Date;
  days: TimelineDay[];
  totalDays: number;
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

function isSameYMD(left: Date, right: Date): boolean {
  return (
    left.getFullYear() === right.getFullYear() &&
    left.getMonth() === right.getMonth() &&
    left.getDate() === right.getDate()
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

export function filterAssignments(
  assignments: GanttAssignment[],
  query: string,
): GanttAssignment[] {
  const trimmed = query.trim().toLowerCase();
  if (!trimmed) return assignments;

  return assignments.filter((assignment) => {
    const haystack = [
      assignment.order_number,
      assignment.baler_name,
      assignment.worker_name,
      assignment.stage,
      assignment.status,
    ]
      .map((part) => String(part ?? "").toLowerCase())
      .join(" ");
    return haystack.includes(trimmed);
  });
}

export function buildTimeline(assignments: GanttAssignment[]): TimelineModel {
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

  const totalMs = rangeEnd.getTime() - rangeStart.getTime();
  const totalDays = Math.max(1, Math.ceil(totalMs / DAY_MS));

  const days: TimelineDay[] = [];
  for (let index = 0; index < totalDays; index += 1) {
    const date = addDays(rangeStart, index);
    const day = date.getDay();
    days.push({
      date,
      iso: isoDateKey(date),
      label: formatDayLabel(date),
      isWeekend: day === 0 || day === 6,
      isToday: isSameYMD(date, today),
    });
  }

  return {
    start: rangeStart,
    end: rangeEnd,
    days,
    totalDays,
  };
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

export function buildOrderRows(assignments: GanttAssignment[]): OrderGanttRow[] {
  const timeline = buildTimeline(assignments);
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

export function buildWorkerRows(assignments: GanttAssignment[]): WorkerGanttRow[] {
  const timeline = buildTimeline(assignments);
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
