import { describe, expect, it } from "vitest";

import { calculateHoursPerWeek } from "@/lib/workerHours";

describe("calculateHoursPerWeek", () => {
  it("uses five fallback days when no schedule is supplied", () => {
    expect(calculateHoursPerWeek(undefined, 8)).toBe(40);
  });

  it("sums working days from start and end times", () => {
    expect(
      calculateHoursPerWeek(
        [
          { is_working: true, start_time: "08:00", end_time: "16:00" },
          { is_working: true, start_time: "08:00", end_time: "15:00" },
          { is_working: true, start_time: "09:30", end_time: "13:00" },
        ],
        8,
      ),
    ).toBe(18.5);
  });

  it("ignores non-working days", () => {
    expect(
      calculateHoursPerWeek(
        [
          { is_working: true, start_time: "08:00", end_time: "16:00" },
          { is_working: false, start_time: "08:00", end_time: "16:00" },
        ],
        8,
      ),
    ).toBe(8);
  });

  it("falls back to hours per day for working rows with missing times", () => {
    expect(
      calculateHoursPerWeek(
        [
          { is_working: true, start_time: null, end_time: null },
          { is_working: true, start_time: "08:00", end_time: "16:00" },
        ],
        7.5,
      ),
    ).toBe(15.5);
  });

  it("falls back to hours per day for invalid overnight-style times", () => {
    expect(
      calculateHoursPerWeek(
        [{ is_working: true, start_time: "22:00", end_time: "06:00" }],
        8,
      ),
    ).toBe(8);
  });

  it("returns zero when every supplied day is non-working", () => {
    expect(
      calculateHoursPerWeek(
        [
          { is_working: false, start_time: null, end_time: null },
          { is_working: false, start_time: null, end_time: null },
        ],
        8,
      ),
    ).toBe(0);
  });
});
