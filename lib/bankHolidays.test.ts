import { describe, expect, it } from "vitest";

import {
  formatBankHolidayAcronym,
  formatBankHolidayTitle,
  getBankHolidayByDateKey,
  getBankHolidaysForRange,
  getEnglandWalesBankHolidays,
  isBankHolidayDateKey,
} from "@/lib/bankHolidays";

describe("getEnglandWalesBankHolidays", () => {
  it("generates Easter bank holidays for 2026", () => {
    const holidays = getEnglandWalesBankHolidays(2026);

    expect(holidays).toContainEqual({
      date: "2026-04-03",
      title: "Good Friday",
      division: "england-and-wales",
    });
    expect(holidays).toContainEqual({
      date: "2026-04-06",
      title: "Easter Monday",
      division: "england-and-wales",
    });
  });

  it("generates Christmas and Boxing Day substitutions for 2026", () => {
    const holidays = getEnglandWalesBankHolidays(2026);

    expect(holidays).toContainEqual({
      date: "2026-12-25",
      title: "Christmas Day",
      division: "england-and-wales",
    });
    expect(holidays).toContainEqual({
      date: "2026-12-28",
      title: "Boxing Day",
      division: "england-and-wales",
    });
  });

  it("substitutes New Year's Day when it falls on a weekend", () => {
    const holidays = getEnglandWalesBankHolidays(2022);

    expect(holidays).toContainEqual({
      date: "2022-01-03",
      title: "New Year's Day",
      division: "england-and-wales",
    });
    expect(holidays.some((holiday) => holiday.date === "2022-01-01")).toBe(
      false,
    );
  });

  it("orders generated holidays by date", () => {
    const dates = getEnglandWalesBankHolidays(2026).map(
      (holiday) => holiday.date,
    );

    expect(dates).toEqual([...dates].sort());
  });
});

describe("bank holiday lookup helpers", () => {
  it("returns bank holidays by date key", () => {
    expect(getBankHolidayByDateKey("2026-04-06")?.title).toBe(
      "Easter Monday",
    );
    expect(isBankHolidayDateKey("2026-04-06")).toBe(true);
    expect(isBankHolidayDateKey("2026-04-07")).toBe(false);
  });

  it("returns holidays within an inclusive range", () => {
    const holidays = getBankHolidaysForRange(
      new Date(2026, 3, 1),
      new Date(2026, 4, 10),
    );

    expect(holidays.map((holiday) => holiday.date)).toEqual([
      "2026-04-03",
      "2026-04-06",
      "2026-05-04",
    ]);
  });
});

describe("formatBankHolidayAcronym", () => {
  it("returns compact labels for staff calendar cells", () => {
    expect(formatBankHolidayAcronym("New Year's Day")).toBe("NYD");
    expect(formatBankHolidayAcronym("Good Friday")).toBe("GF");
    expect(formatBankHolidayAcronym("Easter Monday")).toBe("EM");
    expect(formatBankHolidayAcronym("Early May bank holiday")).toBe("EMBH");
    expect(formatBankHolidayAcronym("Spring bank holiday")).toBe("SBH");
    expect(formatBankHolidayAcronym("Summer bank holiday")).toBe("SUMBH");
    expect(formatBankHolidayAcronym("Christmas Day")).toBe("CD");
    expect(formatBankHolidayAcronym("Boxing Day")).toBe("BD");
  });

  it("falls back to initials for unknown holiday titles", () => {
    expect(formatBankHolidayAcronym("One-off national holiday")).toBe("ONH");
  });
});

describe("formatBankHolidayTitle", () => {
  it("returns polished long-form titles for hover text", () => {
    expect(formatBankHolidayTitle("New Year's Day")).toBe("New Year's Day");
    expect(formatBankHolidayTitle("Good Friday")).toBe("Good Friday");
    expect(formatBankHolidayTitle("Easter Monday")).toBe("Easter Monday");
    expect(formatBankHolidayTitle("Early May bank holiday")).toBe(
      "Early May Bank Holiday",
    );
    expect(formatBankHolidayTitle("Spring bank holiday")).toBe(
      "Spring Bank Holiday",
    );
    expect(formatBankHolidayTitle("Summer bank holiday")).toBe(
      "Summer Bank Holiday",
    );
    expect(formatBankHolidayTitle("Christmas Day")).toBe("Christmas Day");
    expect(formatBankHolidayTitle("Boxing Day")).toBe("Boxing Day");
  });

  it("falls back to the raw title for unknown holiday titles", () => {
    expect(formatBankHolidayTitle("One-off national holiday")).toBe(
      "One-off national holiday",
    );
  });
});
