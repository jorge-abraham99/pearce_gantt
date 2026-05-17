import { afterEach, describe, expect, it, vi } from "vitest";

import {
  buildOrderDisplayRows,
  buildOrderRows,
  buildPlannerStats,
  buildTimeline,
  buildWorkerRows,
  colorForKey,
  filterAssignments,
  positionAssignment,
} from "@/lib/plannerViewModel";
import type { GanttAssignment } from "@/types/planner";

afterEach(() => {
  vi.useRealTimers();
});

function makeAssignment(overrides: Partial<GanttAssignment> = {}): GanttAssignment {
  return {
    assignment_id: 1,
    worker_id: 1,
    worker_name: "Alex",
    order_id: 100,
    order_number: "O-100",
    customer: "forrest_box",
    baler_type_id: 1,
    baler_name: "HB550",
    stage: "Welding",
    stage_order: 1,
    schedule_start: "2026-05-11T08:00:00.000Z",
    schedule_end: "2026-05-11T16:00:00.000Z",
    scheduled_hours: 8,
    status: "scheduled",
    ...overrides,
  };
}

describe("filterAssignments", () => {
  const assignments = [
    makeAssignment({ assignment_id: 1, worker_name: "Alex", stage: "Welding" }),
    makeAssignment({ assignment_id: 2, worker_name: "Sam", stage: "Painting" }),
    makeAssignment({
      assignment_id: 3,
      worker_name: "Riley",
      order_number: "O-200",
      baler_name: "HB880",
    }),
  ];

  it("returns all assignments when filters are empty", () => {
    expect(
      filterAssignments(assignments, { orderNumber: "", customer: "", task: "" }),
    ).toHaveLength(3);
    expect(
      filterAssignments(assignments, {
        orderNumber: "   ",
        customer: "   ",
        task: "   ",
      }),
    ).toHaveLength(3);
  });

  it("does not match worker name", () => {
    const result = filterAssignments(assignments, {
      orderNumber: "alex",
      customer: "",
      task: "",
    });
    expect(result).toHaveLength(0);
  });

  it("matches by exact task", () => {
    const result = filterAssignments(assignments, {
      orderNumber: "",
      customer: "",
      task: "Painting",
    });
    expect(result.map((a) => a.assignment_id)).toEqual([2]);
  });

  it("matches by order number", () => {
    const result = filterAssignments(assignments, {
      orderNumber: "O-200",
      customer: "",
      task: "",
    });
    expect(result.map((a) => a.assignment_id)).toEqual([3]);
  });

  it("applies order number and task together", () => {
    const result = filterAssignments(assignments, {
      orderNumber: "O-100",
      customer: "",
      task: "Welding",
    });
    expect(result.map((a) => a.assignment_id)).toEqual([1]);
  });

  it("does not match baler name", () => {
    const result = filterAssignments(assignments, {
      orderNumber: "hb880",
      customer: "",
      task: "",
    });
    expect(result).toHaveLength(0);
  });

  it("matches task case-insensitively", () => {
    const result = filterAssignments(assignments, {
      orderNumber: "",
      customer: "",
      task: "welding",
    });
    expect(result.map((a) => a.assignment_id)).toEqual([1, 3]);
  });

  it("matches by customer", () => {
    const result = filterAssignments(
      [
        ...assignments,
        makeAssignment({
          assignment_id: 4,
          customer: "other_customer",
        }),
      ],
      { orderNumber: "", customer: "other_customer", task: "" },
    );
    expect(result.map((a) => a.assignment_id)).toEqual([4]);
  });
});

describe("buildTimeline", () => {
  it("returns a default 14-day window when there are no assignments", () => {
    const timeline = buildTimeline([]);
    expect(timeline.totalDays).toBeGreaterThanOrEqual(14);
    expect(timeline.days[0].date.getHours()).toBe(0);
  });

  it("pads one day before and after the assignment range", () => {
    const assignments = [
      makeAssignment({
        schedule_start: "2026-05-11T08:00:00.000Z",
        schedule_end: "2026-05-13T16:00:00.000Z",
      }),
    ];
    const timeline = buildTimeline(assignments);
    const first = timeline.days[0].date;
    const last = timeline.days[timeline.days.length - 1].date;
    expect(first.getTime()).toBeLessThan(new Date("2026-05-11T00:00:00").getTime());
    expect(last.getTime()).toBeGreaterThan(new Date("2026-05-13T00:00:00").getTime());
  });
});

describe("positionAssignment", () => {
  it("computes left/width percentages within timeline range", () => {
    const assignments = [
      makeAssignment({
        schedule_start: "2026-05-11T08:00:00.000Z",
        schedule_end: "2026-05-13T16:00:00.000Z",
      }),
    ];
    const timeline = buildTimeline(assignments);
    const positioned = positionAssignment(assignments[0], timeline);
    expect(positioned.leftPct).toBeGreaterThanOrEqual(0);
    expect(positioned.widthPct).toBeGreaterThan(0);
    expect(positioned.leftPct + positioned.widthPct).toBeLessThanOrEqual(100.001);
  });

  it("enforces a minimum visual width", () => {
    const assignments = [
      makeAssignment({
        schedule_start: "2026-05-11T08:00:00.000Z",
        schedule_end: "2026-05-11T08:01:00.000Z",
      }),
    ];
    const timeline = buildTimeline([
      makeAssignment({
        schedule_start: "2026-05-01T08:00:00.000Z",
        schedule_end: "2026-06-01T16:00:00.000Z",
      }),
    ]);
    const positioned = positionAssignment(assignments[0], timeline);
    expect(positioned.widthPct).toBeGreaterThan(0);
  });
});

describe("buildOrderRows", () => {
  it("groups by order and sorts stages by stage_order", () => {
    const assignments = [
      makeAssignment({
        assignment_id: 1,
        order_id: 100,
        stage: "Painting",
        stage_order: 2,
        schedule_start: "2026-05-13T08:00:00.000Z",
        schedule_end: "2026-05-13T16:00:00.000Z",
        scheduled_hours: 8,
      }),
      makeAssignment({
        assignment_id: 2,
        order_id: 100,
        stage: "Welding",
        stage_order: 1,
        schedule_start: "2026-05-11T08:00:00.000Z",
        schedule_end: "2026-05-11T16:00:00.000Z",
        scheduled_hours: 8,
      }),
      makeAssignment({
        assignment_id: 3,
        order_id: 200,
        order_number: "O-200",
        stage: "Welding",
        stage_order: 1,
        schedule_start: "2026-05-12T08:00:00.000Z",
        schedule_end: "2026-05-12T16:00:00.000Z",
        scheduled_hours: 8,
      }),
    ];

    const rows = buildOrderRows(assignments);
    expect(rows).toHaveLength(2);
    const order100 = rows.find((row) => String(row.orderId) === "100");
    expect(order100).toBeDefined();
    expect(order100!.assignments.map((a) => a.stage)).toEqual([
      "Welding",
      "Painting",
    ]);
    expect(order100!.totalHours).toBe(16);
  });

  it("computes idle gap between stages", () => {
    const assignments = [
      makeAssignment({
        assignment_id: 1,
        order_id: 100,
        stage: "Welding",
        stage_order: 1,
        schedule_start: "2026-05-11T08:00:00.000Z",
        schedule_end: "2026-05-11T16:00:00.000Z",
        scheduled_hours: 8,
      }),
      makeAssignment({
        assignment_id: 2,
        order_id: 100,
        stage: "Painting",
        stage_order: 2,
        schedule_start: "2026-05-12T16:00:00.000Z",
        schedule_end: "2026-05-13T00:00:00.000Z",
        scheduled_hours: 8,
      }),
    ];
    const rows = buildOrderRows(assignments);
    expect(rows[0].idleGapHours).toBeCloseTo(24, 5);
    expect(rows[0].longestStageHours).toBe(8);
  });
});

describe("buildWorkerRows", () => {
  it("groups by worker and computes totals", () => {
    const assignments = [
      makeAssignment({
        assignment_id: 1,
        worker_id: 1,
        worker_name: "Alex",
        scheduled_hours: 8,
      }),
      makeAssignment({
        assignment_id: 2,
        worker_id: 1,
        worker_name: "Alex",
        scheduled_hours: 4,
        schedule_start: "2026-05-12T08:00:00.000Z",
        schedule_end: "2026-05-12T12:00:00.000Z",
      }),
      makeAssignment({
        assignment_id: 3,
        worker_id: 2,
        worker_name: "Sam",
        scheduled_hours: 6,
      }),
    ];
    const rows = buildWorkerRows(assignments);
    expect(rows).toHaveLength(2);
    const alex = rows.find((row) => row.workerName === "Alex");
    expect(alex!.totalHours).toBe(12);
    expect(alex!.assignmentCount).toBe(2);
    expect(rows[0].workerName).toBe("Alex");
  });
});

describe("buildPlannerStats", () => {
  it("returns counts and derived metrics", () => {
    const assignments = [
      makeAssignment({
        assignment_id: 1,
        order_id: 100,
        order_number: "O-100",
        worker_id: 1,
        worker_name: "Alex",
        scheduled_hours: 8,
        stage_order: 1,
        schedule_start: "2026-05-11T08:00:00.000Z",
        schedule_end: "2026-05-11T16:00:00.000Z",
      }),
      makeAssignment({
        assignment_id: 2,
        order_id: 100,
        order_number: "O-100",
        worker_id: 1,
        worker_name: "Alex",
        scheduled_hours: 8,
        stage_order: 2,
        schedule_start: "2026-05-13T08:00:00.000Z",
        schedule_end: "2026-05-13T16:00:00.000Z",
      }),
      makeAssignment({
        assignment_id: 3,
        order_id: 200,
        order_number: "O-200",
        worker_id: 2,
        worker_name: "Sam",
        scheduled_hours: 4,
        stage_order: 1,
        schedule_start: "2026-05-12T08:00:00.000Z",
        schedule_end: "2026-05-12T12:00:00.000Z",
      }),
    ];

    const stats = buildPlannerStats(assignments);
    expect(stats.orderCount).toBe(2);
    expect(stats.assignmentCount).toBe(3);
    expect(stats.workerCount).toBe(2);
    expect(stats.scheduledHours).toBe(20);
    expect(stats.busiestWorker?.workerName).toBe("Alex");
    expect(stats.longestOrder?.orderNumber).toBe("O-100");
    expect(stats.largestIdleGap?.orderNumber).toBe("O-100");
  });

  it("returns zero stats for empty input", () => {
    const stats = buildPlannerStats([]);
    expect(stats.orderCount).toBe(0);
    expect(stats.assignmentCount).toBe(0);
    expect(stats.scheduledHours).toBe(0);
    expect(stats.workerCount).toBe(0);
    expect(stats.longestOrder).toBeUndefined();
    expect(stats.largestIdleGap).toBeUndefined();
    expect(stats.busiestWorker).toBeUndefined();
  });
});

describe("colorForKey", () => {
  it("is deterministic for the same key", () => {
    expect(colorForKey("Welding")).toBe(colorForKey("Welding"));
    expect(colorForKey(100)).toBe(colorForKey("100"));
  });
});

describe("buildTimeline (week)", () => {
  it("snaps the range to Monday-aligned week buckets", () => {
    const assignments = [
      makeAssignment({
        schedule_start: "2026-05-13T08:00:00.000Z",
        schedule_end: "2026-05-15T16:00:00.000Z",
      }),
    ];
    const timeline = buildTimeline(assignments, "week");
    expect(timeline.scale).toBe("week");
    expect(timeline.units.length).toBeGreaterThanOrEqual(1);
    for (const unit of timeline.units) {
      // ISO week start is Monday (day === 1).
      expect(unit.start.getDay()).toBe(1);
    }
    expect(timeline.start.getDay()).toBe(1);
  });
});

describe("buildTimeline (month)", () => {
  it("snaps the range to calendar month buckets", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-15T12:00:00.000Z"));

    const assignments = [
      makeAssignment({
        schedule_start: "2026-05-13T08:00:00.000Z",
        schedule_end: "2026-07-02T16:00:00.000Z",
      }),
    ];
    const timeline = buildTimeline(assignments, "month");

    expect(timeline.scale).toBe("month");
    expect(timeline.units.map((unit) => unit.iso)).toEqual([
      "2026-05",
      "2026-06",
      "2026-07",
    ]);
    expect(timeline.start.getDate()).toBe(1);
    expect(timeline.end.getMonth()).toBe(6);
    expect(timeline.end.getDate()).toBe(31);
    expect(timeline.units[0].isCurrent).toBe(true);
  });

  it("keeps assignment positioning bounded in month scale", () => {
    const assignments = [
      makeAssignment({
        schedule_start: "2026-05-11T08:00:00.000Z",
        schedule_end: "2026-06-03T16:00:00.000Z",
      }),
    ];
    const timeline = buildTimeline(assignments, "month");
    const positioned = positionAssignment(assignments[0], timeline);

    expect(positioned.leftPct).toBeGreaterThanOrEqual(0);
    expect(positioned.widthPct).toBeGreaterThan(0);
    expect(positioned.leftPct + positioned.widthPct).toBeLessThanOrEqual(100.001);
  });
});

describe("buildOrderDisplayRows", () => {
  it("produces one order row followed by its task rows in stage order", () => {
    const assignments = [
      makeAssignment({
        assignment_id: 1,
        order_id: 100,
        stage: "Painting",
        stage_order: 2,
        schedule_start: "2026-05-13T08:00:00.000Z",
        schedule_end: "2026-05-13T16:00:00.000Z",
      }),
      makeAssignment({
        assignment_id: 2,
        order_id: 100,
        stage: "Welding",
        stage_order: 1,
        schedule_start: "2026-05-11T08:00:00.000Z",
        schedule_end: "2026-05-11T16:00:00.000Z",
      }),
    ];
    const rows = buildOrderRows(assignments);
    const display = buildOrderDisplayRows(rows);
    expect(display).toHaveLength(3);
    expect(display[0].kind).toBe("order");
    expect(display[1].kind).toBe("task");
    expect(display[2].kind).toBe("task");
    if (display[1].kind === "task" && display[2].kind === "task") {
      expect(display[1].assignment.stage).toBe("Welding");
      expect(display[2].assignment.stage).toBe("Painting");
    }
  });
});
