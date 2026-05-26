import { describe, expect, it } from "vitest";

import {
  buildFutureScheduleRecalculationPlan,
  hasMaterialScheduleChanges,
  type RecalculationAssignment,
  type RecalculationOrder,
} from "@/lib/recalculateFutureSchedule";
import type {
  BalerRequirement,
  BalerType,
  StgWorker,
  WorkerDefaultSchedule,
  WorkerSkill,
} from "@/types/planner";

function makeSchedule(workerId: number, hoursPerDay: number): WorkerDefaultSchedule[] {
  return Array.from({ length: 7 }, (_, i) => {
    const dayOfWeek = i + 1;
    const isWorking = dayOfWeek <= 5;
    const endHour = 8 + hoursPerDay;
    return {
      worker_id: workerId,
      day_of_week: dayOfWeek,
      is_working: isWorking,
      start_time: isWorking ? "08:00" : null,
      end_time: isWorking ? `${String(endHour).padStart(2, "0")}:00` : null,
    };
  });
}

const workers: StgWorker[] = [
  { id: 1, name: "Welder 1", hours_per_day: 8, hours_per_week: null },
  { id: 2, name: "Sprayer 1", hours_per_day: 8, hours_per_week: null },
  { id: 3, name: "Assembler 1", hours_per_day: 8, hours_per_week: null },
];

const workerSkills: WorkerSkill[] = [
  { id: 1, worker_id: 1, skill: "welding", name: "welding" },
  { id: 2, worker_id: 2, skill: "spraying", name: "spraying" },
  { id: 3, worker_id: 3, skill: "assembling", name: "assembling" },
];

const defaultSchedules: WorkerDefaultSchedule[] = [
  ...makeSchedule(1, 8),
  ...makeSchedule(2, 8),
  ...makeSchedule(3, 8),
];

const balerTypes: BalerType[] = [{ id: 1, name: "HB550" }];

const requirements: BalerRequirement[] = [
  { id: 1, baler_type_id: 1, stage_name: "welding", stage_hour_requirements: 4, stage_sequence: 1 },
  { id: 2, baler_type_id: 1, stage_name: "spraying", stage_hour_requirements: 1, stage_sequence: 2 },
  { id: 3, baler_type_id: 1, stage_name: "assembling", stage_hour_requirements: 2, stage_sequence: 3 },
];

function assignment(
  overrides: Partial<RecalculationAssignment> & Pick<RecalculationAssignment, "id" | "order_id" | "worker_id" | "stage" | "stage_order" | "schedule_start" | "schedule_end" | "scheduled_hours" | "status">,
): RecalculationAssignment {
  return {
    baler_name: "HB550",
    baler_type_id: 1,
    ...overrides,
  };
}

const orders: RecalculationOrder[] = [
  { id: 100, order_number: "O-100", customer: "acme", baler_type_id: 1 },
  { id: 200, order_number: "O-200", customer: "globex", baler_type_id: 1 },
];

describe("buildFutureScheduleRecalculationPlan", () => {
  it("recalculates only orders with no started work", () => {
    const plan = buildFutureScheduleRecalculationPlan({
      cutoffAt: "2026-05-11T12:00:00",
      assignments: [
        assignment({
          id: 1,
          order_id: 100,
          worker_id: 1,
          stage: "welding",
          stage_order: 1,
          schedule_start: "2026-05-12T08:00:00",
          schedule_end: "2026-05-12T12:00:00",
          scheduled_hours: 4,
          status: "scheduled",
        }),
        assignment({
          id: 2,
          order_id: 100,
          worker_id: 2,
          stage: "spraying",
          stage_order: 2,
          schedule_start: "2026-05-12T12:00:00",
          schedule_end: "2026-05-12T13:00:00",
          scheduled_hours: 1,
          status: "scheduled",
        }),
        assignment({
          id: 5,
          order_id: 100,
          worker_id: 3,
          stage: "assembling",
          stage_order: 3,
          schedule_start: "2026-05-12T13:00:00",
          schedule_end: "2026-05-12T14:00:00",
          scheduled_hours: 2,
          status: "scheduled",
        }),
        assignment({
          id: 3,
          order_id: 200,
          worker_id: 1,
          stage: "welding",
          stage_order: 1,
          schedule_start: "2026-05-11T08:00:00",
          schedule_end: "2026-05-11T12:00:00",
          scheduled_hours: 4,
          status: "scheduled",
        }),
        assignment({
          id: 4,
          order_id: 200,
          worker_id: 2,
          stage: "spraying",
          stage_order: 2,
          schedule_start: "2026-05-12T08:00:00",
          schedule_end: "2026-05-12T09:00:00",
          scheduled_hours: 1,
          status: "scheduled",
        }),
        assignment({
          id: 6,
          order_id: 200,
          worker_id: 3,
          stage: "assembling",
          stage_order: 3,
          schedule_start: "2026-05-12T09:00:00",
          schedule_end: "2026-05-12T11:00:00",
          scheduled_hours: 2,
          status: "scheduled",
        }),
      ],
      orders,
      balerTypes,
      requirements,
      workers,
      workerSkills,
      workerBalerTypeCapabilities: [],
      defaultSchedules,
      availabilityExceptions: [],
    });

    expect(plan.ordersConsidered).toBe(2);
    expect(plan.ordersRecalculated).toBe(1);
    expect(plan.ordersSkippedStarted).toBe(1);
    expect(plan.eligibleOrderIds).toEqual([100]);
    expect(plan.skippedOrderIds).toEqual([200]);
    expect(plan.assignmentIdsToRemove).toEqual([1, 2, 5]);
    expect(plan.assignmentsFrozen).toBe(3);
    expect(plan.assignmentsToCreate).toHaveLength(3);
    expect(new Set(plan.assignmentsToCreate.map((item) => item.order_id))).toEqual(
      new Set([100]),
    );
  });

  it("skips an order entirely when any assignment is in progress or completed", () => {
    const plan = buildFutureScheduleRecalculationPlan({
      cutoffAt: "2026-05-11T07:00:00",
      assignments: [
        assignment({
          id: 10,
          order_id: 100,
          worker_id: 1,
          stage: "welding",
          stage_order: 1,
          schedule_start: "2026-05-12T08:00:00",
          schedule_end: "2026-05-12T12:00:00",
          scheduled_hours: 4,
          status: "scheduled",
        }),
        assignment({
          id: 11,
          order_id: 200,
          worker_id: 1,
          stage: "welding",
          stage_order: 1,
          schedule_start: "2026-05-13T08:00:00",
          schedule_end: "2026-05-13T12:00:00",
          scheduled_hours: 4,
          status: "scheduled",
        }),
        assignment({
          id: 12,
          order_id: 200,
          worker_id: 3,
          stage: "assembling",
          stage_order: 3,
          schedule_start: "2026-05-14T08:00:00",
          schedule_end: "2026-05-14T10:00:00",
          scheduled_hours: 2,
          status: "completed",
        }),
      ],
      orders,
      balerTypes,
      requirements,
      workers,
      workerSkills,
      workerBalerTypeCapabilities: [],
      defaultSchedules,
      availabilityExceptions: [],
    });

    expect(plan.ordersConsidered).toBe(2);
    expect(plan.ordersRecalculated).toBe(1);
    expect(plan.ordersSkippedStarted).toBe(1);
    expect(plan.assignmentIdsToRemove).toEqual([10]);
    expect(plan.assignmentsFrozen).toBe(2);
  });

  it("keeps skipped future assignments as capacity blockers during recalculation", () => {
    const singleWorker: StgWorker[] = [
      { id: 1, name: "Welder 1", hours_per_day: 8, hours_per_week: null },
    ];
    const singleSkill: WorkerSkill[] = [
      { id: 1, worker_id: 1, skill: "welding", name: "welding" },
    ];
    const singleStageRequirements: BalerRequirement[] = [
      { id: 1, baler_type_id: 1, stage_name: "welding", stage_hour_requirements: 4, stage_sequence: 1 },
    ];

    const plan = buildFutureScheduleRecalculationPlan({
      cutoffAt: "2026-05-11T07:00:00",
      assignments: [
        assignment({
          id: 21,
          order_id: 100,
          worker_id: 1,
          stage: "welding",
          stage_order: 1,
          schedule_start: "2026-05-12T08:00:00",
          schedule_end: "2026-05-12T12:00:00",
          scheduled_hours: 4,
          status: "scheduled",
        }),
        assignment({
          id: 22,
          order_id: 200,
          worker_id: 1,
          stage: "welding",
          stage_order: 1,
          schedule_start: "2026-05-12T08:00:00",
          schedule_end: "2026-05-12T12:00:00",
          scheduled_hours: 4,
          status: "scheduled",
        }),
        assignment({
          id: 23,
          order_id: 200,
          worker_id: 1,
          stage: "assembling",
          stage_order: 3,
          schedule_start: "2026-05-13T08:00:00",
          schedule_end: "2026-05-13T10:00:00",
          scheduled_hours: 2,
          status: "completed",
        }),
      ],
      orders,
      balerTypes,
      requirements: singleStageRequirements,
      workers: singleWorker,
      workerSkills: singleSkill,
      workerBalerTypeCapabilities: [],
      defaultSchedules: makeSchedule(1, 8),
      availabilityExceptions: [],
    });

    expect(plan.ordersRecalculated).toBe(1);
    expect(plan.ordersSkippedStarted).toBe(1);
    expect(plan.assignmentsToCreate).toHaveLength(1);
    expect(plan.assignmentsToCreate[0].schedule_start).toBe("2026-05-12T12:00:00");
  });

  it("detects when recalculation produces no material changes", () => {
    const plan = buildFutureScheduleRecalculationPlan({
      cutoffAt: "2026-05-11T07:00:00",
      assignments: [
        assignment({
          id: 31,
          order_id: 100,
          worker_id: 1,
          stage: "welding",
          stage_order: 1,
          schedule_start: "2026-05-12T08:00:00",
          schedule_end: "2026-05-12T12:00:00",
          scheduled_hours: 4,
          status: "scheduled",
        }),
        assignment({
          id: 32,
          order_id: 100,
          worker_id: 2,
          stage: "spraying",
          stage_order: 2,
          schedule_start: "2026-05-12T12:00:00",
          schedule_end: "2026-05-12T13:00:00",
          scheduled_hours: 1,
          status: "scheduled",
        }),
        assignment({
          id: 33,
          order_id: 100,
          worker_id: 3,
          stage: "assembling",
          stage_order: 3,
          schedule_start: "2026-05-12T13:00:00",
          schedule_end: "2026-05-12T15:00:00",
          scheduled_hours: 2,
          status: "scheduled",
        }),
      ],
      orders: [orders[0]],
      balerTypes,
      requirements,
      workers,
      workerSkills,
      workerBalerTypeCapabilities: [],
      defaultSchedules,
      availabilityExceptions: [],
    });

    expect(
      hasMaterialScheduleChanges(
        plan.currentMovableAssignments,
        plan.assignmentsToCreate,
      ),
    ).toBe(false);
  });
});
