import { describe, expect, it } from "vitest";

import { computePlannedAssignments } from "@/lib/scheduler";
import type {
  BalerRequirement,
  StgWorker,
  WorkerAvailabilityException,
  WorkerDefaultSchedule,
  WorkerSkill,
} from "@/types/planner";

// ── Test fixtures ─────────────────────────────────────────────────────────────

/**
 * Builds a standard Mon–Fri schedule for a worker.
 * hoursPerDay controls end time: 8h = 08:00–16:00, 10h = 08:00–18:00, etc.
 */
function makeSchedule(workerId: number, hoursPerDay: number): WorkerDefaultSchedule[] {
  return Array.from({ length: 7 }, (_, i) => {
    const dayOfWeek = i + 1; // 1=Mon … 7=Sun
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
  { id: 1, name: "Assembly 1", hours_per_day: 8, hours_per_week: null },
  { id: 2, name: "Welder 1", hours_per_day: 10, hours_per_week: null },
  { id: 3, name: "Sprayer 1", hours_per_day: 6, hours_per_week: null },
];

const workerSkills: WorkerSkill[] = [
  { id: 1, worker_id: 1, skill: "assembling", name: "assembling" },
  { id: 2, worker_id: 2, skill: "welding", name: "welding" },
  { id: 3, worker_id: 3, skill: "spraying", name: "spraying" },
];

const defaultSchedules: WorkerDefaultSchedule[] = [
  ...makeSchedule(1, 8),  // Mon–Fri 08:00–16:00
  ...makeSchedule(2, 10), // Mon–Fri 08:00–18:00
  ...makeSchedule(3, 6),  // Mon–Fri 08:00–14:00
];

const requirements: BalerRequirement[] = [
  { id: 1, baler_type_id: 1, stage_name: "welding", stage_hour_requirements: 12, stage_sequence: 1 },
  { id: 2, baler_type_id: 1, stage_name: "assembling", stage_hour_requirements: 10, stage_sequence: 2 },
  { id: 3, baler_type_id: 1, stage_name: "spraying", stage_hour_requirements: 6, stage_sequence: 3 },
];

const baseInput = {
  balerType: { id: 1 as const, name: "HB550" as const },
  workers,
  workerSkills,
  defaultSchedules,
  availabilityExceptions: [] as import("@/types/planner").WorkerAvailabilityException[],
  existingAssignments: [] as import("@/types/planner").ExistingAssignment[],
};

function makeException(
  workerId: number,
  exceptionType: WorkerAvailabilityException["exception_type"],
  startAt: string,
  endAt: string,
  allDay = false,
): WorkerAvailabilityException {
  return {
    id: `${workerId}-${exceptionType}-${startAt}`,
    worker_id: workerId,
    exception_type: exceptionType,
    start_at: startAt,
    end_at: endAt,
    all_day: allDay,
    title: null,
    notes: null,
  };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("computePlannedAssignments", () => {
  it("schedules stages in sequence and splits long stages across days", () => {
    const output = computePlannedAssignments({
      ...baseInput,
      startDate: "2026-05-11",
      requirements,
    });

    expect(output.totalScheduledHours).toBe(28);
    expect(output.assignments.map((a) => a.stage)).toEqual([
      "welding",
      "welding",
      "assembling",
      "assembling",
      "spraying",
      "spraying",
    ]);
    // assembling must not start before welding finishes
    expect(new Date(output.assignments[2].schedule_start).getTime()).toBeGreaterThanOrEqual(
      new Date(output.assignments[1].schedule_end).getTime(),
    );
  });

  it("skips non-working days (weekend) at schedule start", () => {
    const output = computePlannedAssignments({
      ...baseInput,
      startDate: "2026-05-09", // Saturday
      requirements: [requirements[0]],
    });

    // Scheduled start must fall on Monday (getDay() === 1)
    expect(new Date(output.scheduledStart).getDay()).toBe(1);
  });

  it("respects existing worker capacity", () => {
    const output = computePlannedAssignments({
      ...baseInput,
      startDate: "2026-05-11",
      requirements: [requirements[0]], // welding only
      existingAssignments: [
        {
          id: 99,
          worker_id: 2,
          schedule_start: new Date(2026, 4, 11, 8).toISOString(),  // Mon 08:00
          schedule_end: new Date(2026, 4, 11, 14).toISOString(),   // Mon 14:00
          scheduled_hours: 6,
          status: "scheduled",
        },
      ],
    });

    // Mon: 10 - 6 booked = 4 remaining; Tue: remaining 8h
    expect(output.assignments[0].scheduled_hours).toBe(4);
    expect(output.assignments[1].scheduled_hours).toBe(8);
  });

  it("chooses the eligible worker with the earliest finish", () => {
    const output = computePlannedAssignments({
      ...baseInput,
      startDate: "2026-05-11",
      requirements: [
        { id: 4, baler_type_id: 1, stage_name: "welding", stage_hour_requirements: 9, stage_sequence: 1 },
      ],
      workers: [
        ...workers,
        { id: 4, name: "Welder 2", hours_per_day: 6, hours_per_week: null },
      ],
      workerSkills: [
        ...workerSkills,
        { id: 5, worker_id: 4, skill: "welding", name: "welding" },
      ],
      defaultSchedules: [
        ...defaultSchedules,
        ...makeSchedule(4, 6), // Mon–Fri 08:00–14:00
      ],
    });

    // Worker 2 (10h/day) finishes 9h in 1 day; Worker 4 (6h/day) needs 2 days
    expect(output.assignments[0].worker_id).toBe(2);
  });

  it("throws when no worker has the required skill", () => {
    expect(() =>
      computePlannedAssignments({
        ...baseInput,
        startDate: "2026-05-11",
        requirements: [
          { id: 5, baler_type_id: 1, stage_name: "testing", stage_hour_requirements: 1, stage_sequence: 1 },
        ],
      }),
    ).toThrow("No worker available for stage: testing");
  });

  it("normalises skill aliases — 'weld' matches stage 'welding'", () => {
    const output = computePlannedAssignments({
      ...baseInput,
      startDate: "2026-05-11",
      requirements: [
        { id: 6, baler_type_id: 1, stage_name: "welding", stage_hour_requirements: 4, stage_sequence: 1 },
      ],
      workerSkills: [
        { id: 10, worker_id: 2, skill: "weld", name: "weld" },
      ],
    });

    expect(output.assignments[0].worker_id).toBe(2);
    expect(output.assignments[0].scheduled_hours).toBe(4);
  });

  it.each(["holiday", "sickness", "other_absence", "unavailable"] as const)(
    "marks a worker unavailable on %s exception dates",
    (exceptionType) => {
    // Worker 2 has an absence on 2026-05-11 (Mon) — should not be scheduled that day
    const output = computePlannedAssignments({
      ...baseInput,
      startDate: "2026-05-11",
      requirements: [
        { id: 7, baler_type_id: 1, stage_name: "welding", stage_hour_requirements: 4, stage_sequence: 1 },
      ],
      availabilityExceptions: [
        {
          id: 1,
          worker_id: 2,
          exception_type: exceptionType,
          start_at: "2026-05-11T00:00:00",
          end_at: "2026-05-11T23:59:59",
          all_day: true,
          title: "Absence",
          notes: null,
        },
      ],
    });

    // Must not start on Monday (holiday); must start on Tuesday
    const startDate = new Date(output.scheduledStart);
    expect(startDate.getDay()).toBe(2); // Tuesday
    },
  );

  it("uses default schedule hours_per_day fallback when no schedule row exists", () => {
    // Worker with no defaultSchedules entry — should fall back to hours_per_day at 08:00
    const output = computePlannedAssignments({
      ...baseInput,
      startDate: "2026-05-11",
      requirements: [
        { id: 8, baler_type_id: 1, stage_name: "welding", stage_hour_requirements: 5, stage_sequence: 1 },
      ],
      defaultSchedules: [], // no schedule rows at all
    });

    // Worker 2 (hours_per_day=10) can do 5h in one go
    expect(output.assignments).toHaveLength(1);
    expect(output.assignments[0].scheduled_hours).toBe(5);
  });

  it("uses overtime as an exact extra window after the normal shift", () => {
    const output = computePlannedAssignments({
      ...baseInput,
      startDate: "2026-05-11",
      requirements: [
        { id: 9, baler_type_id: 1, stage_name: "assembling", stage_hour_requirements: 2, stage_sequence: 1 },
      ],
      availabilityExceptions: [
        makeException(1, "overtime", "2026-05-11T16:00:00", "2026-05-11T18:00:00"),
      ],
      existingAssignments: [
        {
          id: 101,
          worker_id: 1,
          schedule_start: new Date(2026, 4, 11, 8).toISOString(),
          schedule_end: new Date(2026, 4, 11, 16).toISOString(),
          scheduled_hours: 8,
          status: "scheduled",
        },
      ],
    });

    expect(output.assignments).toHaveLength(1);
    expect(new Date(output.assignments[0].schedule_start).getHours()).toBe(16);
    expect(new Date(output.assignments[0].schedule_end).getHours()).toBe(18);
    expect(output.assignments[0].scheduled_hours).toBe(2);
  });

  it("does not invent availability before a later overtime window starts", () => {
    const output = computePlannedAssignments({
      ...baseInput,
      startDate: "2026-05-11",
      requirements: [
        { id: 10, baler_type_id: 1, stage_name: "assembling", stage_hour_requirements: 2, stage_sequence: 1 },
      ],
      availabilityExceptions: [
        makeException(1, "overtime", "2026-05-11T17:00:00", "2026-05-11T19:00:00"),
      ],
      existingAssignments: [
        {
          id: 102,
          worker_id: 1,
          schedule_start: new Date(2026, 4, 11, 8).toISOString(),
          schedule_end: new Date(2026, 4, 11, 16).toISOString(),
          scheduled_hours: 8,
          status: "scheduled",
        },
      ],
    });

    expect(output.assignments).toHaveLength(1);
    expect(new Date(output.assignments[0].schedule_start).getHours()).toBe(17);
    expect(new Date(output.assignments[0].schedule_end).getHours()).toBe(19);
  });

  it("merges overlapping overtime windows instead of double-counting them", () => {
    const output = computePlannedAssignments({
      ...baseInput,
      startDate: "2026-05-11",
      requirements: [
        { id: 11, baler_type_id: 1, stage_name: "assembling", stage_hour_requirements: 3, stage_sequence: 1 },
      ],
      availabilityExceptions: [
        makeException(1, "overtime", "2026-05-11T16:00:00", "2026-05-11T18:00:00"),
        makeException(1, "overtime", "2026-05-11T17:00:00", "2026-05-11T19:00:00"),
      ],
      existingAssignments: [
        {
          id: 103,
          worker_id: 1,
          schedule_start: new Date(2026, 4, 11, 8).toISOString(),
          schedule_end: new Date(2026, 4, 11, 16).toISOString(),
          scheduled_hours: 8,
          status: "scheduled",
        },
      ],
    });

    expect(output.assignments).toHaveLength(1);
    expect(output.assignments[0].scheduled_hours).toBe(3);
    expect(new Date(output.assignments[0].schedule_start).getHours()).toBe(16);
    expect(new Date(output.assignments[0].schedule_end).getHours()).toBe(19);
  });

  it("keeps custom shift behavior as an extra exact window", () => {
    const output = computePlannedAssignments({
      ...baseInput,
      startDate: "2026-05-11",
      requirements: [
        { id: 12, baler_type_id: 1, stage_name: "assembling", stage_hour_requirements: 2, stage_sequence: 1 },
      ],
      availabilityExceptions: [
        makeException(1, "custom_shift", "2026-05-11T18:00:00", "2026-05-11T20:00:00"),
      ],
      existingAssignments: [
        {
          id: 104,
          worker_id: 1,
          schedule_start: new Date(2026, 4, 11, 8).toISOString(),
          schedule_end: new Date(2026, 4, 11, 16).toISOString(),
          scheduled_hours: 8,
          status: "scheduled",
        },
      ],
    });

    expect(output.assignments).toHaveLength(1);
    expect(new Date(output.assignments[0].schedule_start).getHours()).toBe(18);
    expect(new Date(output.assignments[0].schedule_end).getHours()).toBe(20);
  });
});
