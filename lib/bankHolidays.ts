export type BankHoliday = {
  date: string;
  title: string;
  division: "england-and-wales";
};

const DIVISION: BankHoliday["division"] = "england-and-wales";
const HOLIDAY_ACRONYMS: Record<string, string> = {
  "New Year's Day": "NYD",
  "Good Friday": "GF",
  "Easter Monday": "EM",
  "Early May bank holiday": "EMBH",
  "Spring bank holiday": "SBH",
  "Summer bank holiday": "SUMBH",
  "Christmas Day": "CD",
  "Boxing Day": "BD",
};
const HOLIDAY_DISPLAY_TITLES: Record<string, string> = {
  "New Year's Day": "New Year's Day",
  "Good Friday": "Good Friday",
  "Easter Monday": "Easter Monday",
  "Early May bank holiday": "Early May Bank Holiday",
  "Spring bank holiday": "Spring Bank Holiday",
  "Summer bank holiday": "Summer Bank Holiday",
  "Christmas Day": "Christmas Day",
  "Boxing Day": "Boxing Day",
};

export function getEnglandWalesBankHolidays(year: number): BankHoliday[] {
  const holidays: BankHoliday[] = [
    holiday(observedDateForFixedHoliday(year, 0, 1), "New Year's Day"),
    holiday(offsetDate(getEasterSunday(year), -2), "Good Friday"),
    holiday(offsetDate(getEasterSunday(year), 1), "Easter Monday"),
    holiday(nthWeekdayOfMonth(year, 4, 1, 1), "Early May bank holiday"),
    holiday(lastWeekdayOfMonth(year, 4, 1), "Spring bank holiday"),
    holiday(lastWeekdayOfMonth(year, 7, 1), "Summer bank holiday"),
    ...getChristmasBankHolidays(year),
  ];

  return holidays.sort((left, right) => left.date.localeCompare(right.date));
}

export function getBankHolidaysForRange(start: Date, end: Date): BankHoliday[] {
  const startYear = start.getFullYear();
  const endYear = end.getFullYear();
  const startKey = toDateKey(start);
  const endKey = toDateKey(end);
  const holidays: BankHoliday[] = [];

  for (let year = startYear; year <= endYear; year += 1) {
    holidays.push(...getEnglandWalesBankHolidays(year));
  }

  return holidays.filter(
    (holidayDate) =>
      holidayDate.date >= startKey && holidayDate.date <= endKey,
  );
}

export function getBankHolidayByDateKey(dateKey: string): BankHoliday | null {
  const year = Number(dateKey.slice(0, 4));
  if (!Number.isInteger(year)) return null;

  return (
    getEnglandWalesBankHolidays(year).find(
      (holidayDate) => holidayDate.date === dateKey,
    ) ?? null
  );
}

export function isBankHolidayDateKey(dateKey: string): boolean {
  return getBankHolidayByDateKey(dateKey) !== null;
}

export function formatBankHolidayAcronym(title: string): string {
  return (
    HOLIDAY_ACRONYMS[title] ??
    title
      .split(/\s+/)
      .map((word) => word[0]?.toUpperCase() ?? "")
      .join("")
      .slice(0, 5)
  );
}

export function formatBankHolidayTitle(title: string): string {
  return HOLIDAY_DISPLAY_TITLES[title] ?? title;
}

function holiday(date: Date, title: string): BankHoliday {
  return {
    date: toDateKey(date),
    title,
    division: DIVISION,
  };
}

function toDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function observedDateForFixedHoliday(
  year: number,
  monthIndex: number,
  dayOfMonth: number,
): Date {
  const date = new Date(year, monthIndex, dayOfMonth);
  const day = date.getDay();

  if (day === 6) return new Date(year, monthIndex, dayOfMonth + 2);
  if (day === 0) return new Date(year, monthIndex, dayOfMonth + 1);
  return date;
}

function getChristmasBankHolidays(year: number): BankHoliday[] {
  const christmas = new Date(year, 11, 25);
  const boxingDay = new Date(year, 11, 26);
  const christmasWeekday = christmas.getDay();
  const boxingWeekday = boxingDay.getDay();

  if (christmasWeekday === 6) {
    return [
      holiday(new Date(year, 11, 27), "Christmas Day"),
      holiday(new Date(year, 11, 28), "Boxing Day"),
    ];
  }

  if (christmasWeekday === 0) {
    return [
      holiday(new Date(year, 11, 26), "Boxing Day"),
      holiday(new Date(year, 11, 27), "Christmas Day"),
    ];
  }

  return [
    holiday(christmas, "Christmas Day"),
    holiday(
      boxingWeekday === 6 || boxingWeekday === 0
        ? new Date(year, 11, 28)
        : boxingDay,
      "Boxing Day",
    ),
  ];
}

function nthWeekdayOfMonth(
  year: number,
  monthIndex: number,
  weekday: number,
  occurrence: number,
): Date {
  const date = new Date(year, monthIndex, 1);
  const offset = (weekday - date.getDay() + 7) % 7;
  date.setDate(1 + offset + (occurrence - 1) * 7);
  return date;
}

function lastWeekdayOfMonth(
  year: number,
  monthIndex: number,
  weekday: number,
): Date {
  const date = new Date(year, monthIndex + 1, 0);
  const offset = (date.getDay() - weekday + 7) % 7;
  date.setDate(date.getDate() - offset);
  return date;
}

function offsetDate(date: Date, days: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function getEasterSunday(year: number): Date {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;

  return new Date(year, month - 1, day);
}
