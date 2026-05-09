import { describe, expect, it } from "vitest";

import { computePlannedAssignments } from "@/lib/scheduler";
import type { BalerRequirement, Worker } from "@/types/planner";

const workers: Worker[] = [
  {
    id: 1,
    name: "Assembly 1",
    hours_per_day: 8,
    skill_1: "pressing",
    skill_2: "assembling",
  },
  {
    id: 2,
    name: "Welder 1",
    hours_per_day: 10,
    skill_1: "welding",
    skill_2: null,
  },
  {
    id: 3,
    name: "Sprayer 1",
    hours_per_day: 6,
    skill_1: "spraying",
    skill_2: null,
  },
];

const requirements: BalerRequirement[] = [
  {
    id: 1,
    baler_type_id: 1,
    stage_name: "pressing",
    stage_hour_requirements: 10,
    stage_sequence: 1,
  },
  {
    id: 2,
    baler_type_id: 1,
    stage_name: "welding",
    stage_hour_requirements: 12,
    stage_sequence: 2,
  },
  {
    id: 3,
    baler_type_id: 1,
    stage_name: "spraying",
    stage_hour_requirements: 6,
    stage_sequence: 3,
  },
];

describe("computePlannedAssignments", () => {
  it("schedules stages in sequence and splits long stages across days", () => {
    const output = computePlannedAssignments({
      startDate: "2026-05-11",
      balerType: { id: 1, name: "HB550" },
      requirements,
      workers,
      existingAssignments: [],
    });

    expect(output.totalScheduledHours).toBe(28);
    expect(output.assignments.map((assignment) => assignment.stage)).toEqual([
      "pressing",
      "pressing",
      "welding",
      "welding",
      "spraying",
      "spraying",
    ]);
    expect(new Date(output.assignments[2].schedule_start).getTime()).toBeGreaterThanOrEqual(
      new Date(output.assignments[1].schedule_end).getTime(),
    );
  });

  it("skips weekend starts", () => {
    const output = computePlannedAssignments({
      startDate: "2026-05-09",
      balerType: { id: 1, name: "HB550" },
      requirements: [requirements[0]],
      workers,
      existingAssignments: [],
    });

    expect(new Date(output.scheduledStart).getDay()).toBe(1);
  });

  it("respects existing worker capacity", () => {
    const output = computePlannedAssignments({
      startDate: "2026-05-11",
      balerType: { id: 1, name: "HB550" },
      requirements: [requirements[1]],
      workers,
      existingAssignments: [
        {
          id: 99,
          worker_id: 2,
          schedule_start: new Date(2026, 4, 11, 8).toISOString(),
          schedule_end: new Date(2026, 4, 11, 14).toISOString(),
          scheduled_hours: 6,
          status: "scheduled",
        },
      ],
    });

    expect(output.assignments[0].scheduled_hours).toBe(4);
    expect(output.assignments[1].scheduled_hours).toBe(8);
  });

  it("chooses the eligible worker with the earliest finish", () => {
    const output = computePlannedAssignments({
      startDate: "2026-05-11",
      balerType: { id: 1, name: "HB550" },
      requirements: [
        {
          id: 4,
          baler_type_id: 1,
          stage_name: "welding",
          stage_hour_requirements: 9,
          stage_sequence: 1,
        },
      ],
      workers: [
        ...workers,
        {
          id: 4,
          name: "Welder 2",
          hours_per_day: 6,
          skill_1: "welding",
          skill_2: null,
        },
      ],
      existingAssignments: [],
    });

    expect(output.assignments[0].worker_id).toBe(2);
  });

  it("throws when no worker has the required skill", () => {
    expect(() =>
      computePlannedAssignments({
        startDate: "2026-05-11",
        balerType: { id: 1, name: "HB550" },
        requirements: [
          {
            id: 5,
            baler_type_id: 1,
            stage_name: "testing",
            stage_hour_requirements: 1,
            stage_sequence: 1,
          },
        ],
        workers,
        existingAssignments: [],
      }),
    ).toThrow("No worker available for stage: testing");
  });
});
