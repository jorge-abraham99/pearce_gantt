export const WORKDAY_START_HOUR = 8;

export function isWeekend(date: Date): boolean {
  const day = date.getDay();
  return day === 0 || day === 6;
}

export function startOfDay(date: Date): Date {
  const next = new Date(date);
  next.setHours(0, 0, 0, 0);
  return next;
}

export function atStartOfWorkday(dateInput: Date | string): Date {
  const date =
    typeof dateInput === "string" ? parseDateOnlyAsLocal(dateInput) : new Date(dateInput);
  date.setHours(WORKDAY_START_HOUR, 0, 0, 0);
  return isWeekend(date) ? nextWorkingDay(date) : date;
}

export function parseDateOnlyAsLocal(value: string): Date {
  const dateOnlyMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (dateOnlyMatch) {
    const [, year, month, day] = dateOnlyMatch;
    return new Date(Number(year), Number(month) - 1, Number(day));
  }

  return new Date(value);
}

export function nextWorkingDay(date: Date): Date {
  const next = startOfDay(date);
  next.setDate(next.getDate() + 1);
  next.setHours(WORKDAY_START_HOUR, 0, 0, 0);

  while (isWeekend(next)) {
    next.setDate(next.getDate() + 1);
  }

  return next;
}

export function getWorkDate(dateInput: Date | string): string {
  const date = typeof dateInput === "string" ? new Date(dateInput) : dateInput;
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function addHours(date: Date, hours: number): Date {
  return new Date(date.getTime() + hours * 60 * 60 * 1000);
}

export function maxDate(left: Date, right: Date): Date {
  return left.getTime() >= right.getTime() ? new Date(left) : new Date(right);
}

export function dateKeyToWorkday(dateKey: string): Date {
  return atStartOfWorkday(dateKey);
}
