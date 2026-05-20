export type WeeklyScheduleRow = {
  is_working: boolean;
  start_time?: string | null;
  end_time?: string | null;
};

export function calculateHoursPerWeek(
  schedule: WeeklyScheduleRow[] | null | undefined,
  fallbackHoursPerDay: number,
): number {
  if (!schedule || schedule.length === 0) {
    return fallbackHoursPerDay * 5;
  }

  let total = 0;
  for (const row of schedule) {
    if (!row.is_working) continue;

    const timedHours = calculateTimedHours(row.start_time, row.end_time);
    total += timedHours ?? fallbackHoursPerDay;
  }

  return total;
}

function calculateTimedHours(
  startTime: string | null | undefined,
  endTime: string | null | undefined,
): number | null {
  const start = parseTimeToHours(startTime);
  const end = parseTimeToHours(endTime);
  if (start === null || end === null || end <= start) return null;
  return end - start;
}

function parseTimeToHours(value: string | null | undefined): number | null {
  if (!value) return null;
  const [hours, minutes = "0"] = value.split(":");
  const hourNum = Number(hours);
  const minuteNum = Number(minutes);
  if (
    !Number.isFinite(hourNum) ||
    !Number.isFinite(minuteNum) ||
    hourNum < 0 ||
    hourNum > 23 ||
    minuteNum < 0 ||
    minuteNum > 59
  ) {
    return null;
  }
  return hourNum + minuteNum / 60;
}
