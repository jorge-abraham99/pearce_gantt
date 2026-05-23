import {
  WORKDAY_START_HOUR,
  addHours,
  getWorkDate,
  maxDate,
  parseDateOnlyAsLocal,
} from "@/lib/dates";
import { isBankHolidayDateKey } from "@/lib/bankHolidays";
import type {
  ExistingAssignment,
  Id,
  PlannedAssignment,
  SchedulerInput,
  SchedulerOutput,
  WorkerAvailabilityException,
  WorkerDefaultSchedule,
} from "@/types/planner";

// ── Internal types ────────────────────────────────────────────────────────────

type EnrichedWorker = {
  id: Id;
  name: string;
  hours_per_day: number;
  skills: Set<string>;
  defaultSchedule: WorkerDefaultSchedule[];
  exceptions: WorkerAvailabilityException[];
};

type TimeWindow = {
  start: Date;
  end: Date;
};

type CandidateSchedule = {
  worker: EnrichedWorker;
  assignments: PlannedAssignment[];
  finishTime: Date;
};

type BusyMap = Map<string, TimeWindow[]>;

// ── Skill normalisation ───────────────────────────────────────────────────────

// Common aliases so that worker skill labels and stage names still align.
const SKILL_ALIASES: Record<string, string> = {
  weld: "welding",
  spray: "spraying",
  assemble: "assembling",
  fab: "fabrication",
  fabricate: "fabrication",
};

function normalizeSkill(raw: string): string {
  const lower = raw.toLowerCase().trim();
  return SKILL_ALIASES[lower] ?? lower;
}

// ── Availability helpers ──────────────────────────────────────────────────────

function isoWeekday(date: Date): number {
  const d = date.getDay(); // 0 = Sun
  return d === 0 ? 7 : d; // 1 = Mon … 7 = Sun
}

/** "08:30" → 8.5 */
function timeToHours(timeStr: string): number {
  const [h, m] = timeStr.split(":").map(Number);
  return (h ?? 0) + (m ?? 0) / 60;
}

function exceptionCoversDateKey(ex: WorkerAvailabilityException, dateKey: string): boolean {
  const midnight = parseDateOnlyAsLocal(dateKey);
  const nextMidnight = addHours(midnight, 24);
  return new Date(ex.start_at) < nextMidnight && new Date(ex.end_at) > midnight;
}

/**
 * Returns the exact availability windows for a worker on a given date.
 *
 * Priority:
 *  1. worker_default_schedule for that day_of_week
 *  2. fallback to hours_per_day at WORKDAY_START_HOUR if no schedule row exists
 *  3. overtime / custom_shift append exact extra windows
 *  4. absence / unavailable exceptions subtract or block windows
 */
export function getWorkerAvailabilityWindows(
  worker: EnrichedWorker,
  dateKey: string,
): TimeWindow[] {
  const midnight = parseDateOnlyAsLocal(dateKey);
  if (isBankHolidayDateKey(dateKey)) {
    return [];
  }

  const nextMidnight = addHours(midnight, 24);
  const dayOfWeek = isoWeekday(midnight);

  const onDate = worker.exceptions.filter((e) =>
    exceptionCoversDateKey(e, dateKey),
  );

  const daySchedule = worker.defaultSchedule.find(
    (s) => s.day_of_week === dayOfWeek,
  );

  const baseWindows: TimeWindow[] = [];

  if (!daySchedule) {
    const fallbackStart = addHours(midnight, WORKDAY_START_HOUR);
    const fallbackEnd = addHours(fallbackStart, worker.hours_per_day);
    if (fallbackEnd.getTime() > fallbackStart.getTime()) {
      baseWindows.push({ start: fallbackStart, end: fallbackEnd });
    }
  } else if (daySchedule.is_working) {
    const startHour = daySchedule.start_time
      ? timeToHours(daySchedule.start_time)
      : WORKDAY_START_HOUR;
    const endHour = daySchedule.end_time
      ? timeToHours(daySchedule.end_time)
      : startHour + worker.hours_per_day;

    if (endHour > startHour) {
      baseWindows.push({
        start: addHours(midnight, startHour),
        end: addHours(midnight, endHour),
      });
    }
  }

  const additiveWindows = onDate
    .filter(
      (e) =>
        e.exception_type === "overtime" || e.exception_type === "custom_shift",
    )
    .map((e) => clampRangeToDate(e.start_at, e.end_at, midnight, nextMidnight))
    .filter(isTimeWindow);

  const blockingExceptions = onDate.filter(
    (e) =>
      e.exception_type === "holiday" ||
      e.exception_type === "sickness" ||
      e.exception_type === "other_absence" ||
      e.exception_type === "unavailable",
  );

  if (blockingExceptions.some((e) => e.all_day)) {
    return [];
  }

  const blockedWindows = blockingExceptions
    .map((e) => clampRangeToDate(e.start_at, e.end_at, midnight, nextMidnight))
    .filter(isTimeWindow);

  const mergedAvailability = mergeTimeWindows([
    ...baseWindows,
    ...additiveWindows,
  ]);

  if (blockedWindows.length === 0) {
    return mergedAvailability;
  }

  return subtractTimeWindows(
    mergedAvailability,
    mergeTimeWindows(blockedWindows),
  );
}

function clampRangeToDate(
  startAt: string,
  endAt: string,
  dayStart: Date,
  dayEnd: Date,
): TimeWindow | null {
  const start = maxDate(new Date(startAt), dayStart);
  const end = minDate(new Date(endAt), dayEnd);

  if (end.getTime() <= start.getTime()) {
    return null;
  }

  return { start, end };
}

function mergeTimeWindows(windows: TimeWindow[]): TimeWindow[] {
  if (windows.length === 0) return [];

  const sorted = [...windows].sort(
    (a, b) => a.start.getTime() - b.start.getTime(),
  );
  const merged: TimeWindow[] = [{ start: new Date(sorted[0].start), end: new Date(sorted[0].end) }];

  for (const window of sorted.slice(1)) {
    const current = merged[merged.length - 1];
    if (window.start.getTime() <= current.end.getTime()) {
      if (window.end.getTime() > current.end.getTime()) {
        current.end = new Date(window.end);
      }
      continue;
    }
    merged.push({ start: new Date(window.start), end: new Date(window.end) });
  }

  return merged;
}

function subtractTimeWindows(
  sourceWindows: TimeWindow[],
  blockedWindows: TimeWindow[],
): TimeWindow[] {
  if (sourceWindows.length === 0) return [];
  if (blockedWindows.length === 0) return sourceWindows;

  const blocked = mergeTimeWindows(blockedWindows);
  const result: TimeWindow[] = [];

  for (const source of sourceWindows) {
    let cursor = new Date(source.start);

    for (const block of blocked) {
      if (block.end.getTime() <= cursor.getTime()) continue;
      if (block.start.getTime() >= source.end.getTime()) break;

      if (block.start.getTime() > cursor.getTime()) {
        result.push({
          start: new Date(cursor),
          end: minDate(block.start, source.end),
        });
      }

      if (block.end.getTime() >= source.end.getTime()) {
        cursor = new Date(source.end);
        break;
      }

      cursor = maxDate(cursor, block.end);
    }

    if (cursor.getTime() < source.end.getTime()) {
      result.push({ start: new Date(cursor), end: new Date(source.end) });
    }
  }

  return result.filter((window) => window.end.getTime() > window.start.getTime());
}

function minDate(left: Date, right: Date): Date {
  return left.getTime() <= right.getTime() ? new Date(left) : new Date(right);
}

function isTimeWindow(value: TimeWindow | null): value is TimeWindow {
  return value !== null;
}

function diffHours(start: Date, end: Date): number {
  return (end.getTime() - start.getTime()) / 3_600_000;
}

function addBusyWindow(busyByDay: BusyMap, dateKey: string, window: TimeWindow) {
  const current = busyByDay.get(dateKey) ?? [];
  busyByDay.set(
    dateKey,
    mergeTimeWindows([...current, { start: window.start, end: window.end }]),
  );
}

function splitRangeByDay(start: Date, end: Date): Array<{ dateKey: string; window: TimeWindow }> {
  const segments: Array<{ dateKey: string; window: TimeWindow }> = [];
  if (end.getTime() <= start.getTime()) return segments;

  let segmentStart = new Date(start);

  while (segmentStart.getTime() < end.getTime()) {
    const dayStart = parseDateOnlyAsLocal(getWorkDate(segmentStart));
    const nextMidnight = addHours(dayStart, 24);
    const segmentEnd = minDate(end, nextMidnight);
    segments.push({
      dateKey: getWorkDate(segmentStart),
      window: { start: new Date(segmentStart), end: segmentEnd },
    });
    segmentStart = segmentEnd;
  }

  return segments;
}

// ── Core scheduler ────────────────────────────────────────────────────────────

export function computePlannedAssignments(input: SchedulerInput): SchedulerOutput {
  const requirements = [...input.requirements].sort(
    (a, b) => a.stage_sequence - b.stage_sequence,
  );

  if (requirements.length === 0) {
    throw new Error(`No requirements found for baler type: ${input.balerType.name}`);
  }

  // Group skills, schedules, exceptions per worker
  const skillsByWorker = new Map<string, string[]>();
  for (const s of input.workerSkills) {
    const key = String(s.worker_id);
    const list = skillsByWorker.get(key) ?? [];
    list.push(normalizeSkill(s.skill));
    skillsByWorker.set(key, list);
  }

  const schedulesByWorker = new Map<string, WorkerDefaultSchedule[]>();
  for (const s of input.defaultSchedules) {
    const key = String(s.worker_id);
    const list = schedulesByWorker.get(key) ?? [];
    list.push(s);
    schedulesByWorker.set(key, list);
  }

  const exceptionsByWorker = new Map<string, WorkerAvailabilityException[]>();
  for (const e of input.availabilityExceptions) {
    const key = String(e.worker_id);
    const list = exceptionsByWorker.get(key) ?? [];
    list.push(e);
    exceptionsByWorker.set(key, list);
  }

  const enrichedWorkers: EnrichedWorker[] = input.workers.map((w) => ({
    id: w.id,
    name: w.name,
    hours_per_day: w.hours_per_day,
    skills: new Set(skillsByWorker.get(String(w.id)) ?? []),
    defaultSchedule: schedulesByWorker.get(String(w.id)) ?? [],
    exceptions: exceptionsByWorker.get(String(w.id)) ?? [],
  }));

  const workingAssignments: ExistingAssignment[] = [...input.existingAssignments];
  const plannedAssignments: PlannedAssignment[] = [];
  // Start from local midnight of startDate — the loop determines actual workday start
  let previousStageFinish = parseDateOnlyAsLocal(input.startDate);

  for (const requirement of requirements) {
    const requiredHours = Number(requirement.stage_hour_requirements);
    if (!Number.isFinite(requiredHours) || requiredHours <= 0) {
      throw new Error(`Invalid hour requirement for stage: ${requirement.stage_name}`);
    }

    const normalizedStage = normalizeSkill(requirement.stage_name);
    const eligibleWorkers = enrichedWorkers.filter((w) =>
      w.skills.has(normalizedStage),
    );

    if (eligibleWorkers.length === 0) {
      throw new Error(`No worker available for stage: ${requirement.stage_name}`);
    }

    const candidates = eligibleWorkers.map((worker) =>
      simulateWorkerSchedule({
        worker,
        stage: requirement.stage_name,
        stageOrder: requirement.stage_sequence,
        requiredHours,
        notBefore: previousStageFinish,
        existingAssignments: workingAssignments,
      }),
    );

    const bestSchedule = chooseEarliestFinish(candidates);
    plannedAssignments.push(...bestSchedule.assignments);
    workingAssignments.push(...bestSchedule.assignments);
    previousStageFinish = bestSchedule.finishTime;
  }

  return {
    assignments: plannedAssignments,
    scheduledStart:
      plannedAssignments[0]?.schedule_start ?? previousStageFinish.toISOString(),
    scheduledEnd:
      plannedAssignments[plannedAssignments.length - 1]?.schedule_end ??
      previousStageFinish.toISOString(),
    totalScheduledHours: roundHours(
      plannedAssignments.reduce((acc, a) => acc + a.scheduled_hours, 0),
    ),
  };
}

// ── Private simulation ────────────────────────────────────────────────────────

function simulateWorkerSchedule(input: {
  worker: EnrichedWorker;
  stage: string;
  stageOrder: number;
  requiredHours: number;
  notBefore: Date;
  existingAssignments: ExistingAssignment[];
}): CandidateSchedule {
  const busyByDay = buildBusyMap(input.worker.id, input.existingAssignments);
  const assignments: PlannedAssignment[] = [];
  let remainingHours = input.requiredHours;
  let cursor = new Date(input.notBefore);

  while (remainingHours > EPSILON) {
    const dateKey = getWorkDate(cursor);
    const availabilityWindows = subtractTimeWindows(
      getWorkerAvailabilityWindows(
        input.worker,
        dateKey,
      ),
      busyByDay.get(dateKey) ?? [],
    );

    if (availabilityWindows.length === 0) {
      cursor = advanceOneDay(cursor);
      continue;
    }

    let scheduledThisDay = false;

    for (const window of availabilityWindows) {
      const scheduleStart = maxDate(window.start, cursor);
      if (scheduleStart.getTime() >= window.end.getTime()) {
        continue;
      }

      const availableHours = diffHours(scheduleStart, window.end);
      if (availableHours <= EPSILON) {
        continue;
      }

      const hoursToSchedule = Math.min(remainingHours, availableHours);
      const scheduleEnd = addHours(scheduleStart, hoursToSchedule);

      assignments.push({
        worker_id: input.worker.id, // stg_workers.id
        stage: input.stage,
        stage_order: input.stageOrder,
        schedule_start: scheduleStart.toISOString(),
        schedule_end: scheduleEnd.toISOString(),
        scheduled_hours: roundHours(hoursToSchedule),
        status: "scheduled",
      });

      addBusyWindow(busyByDay, dateKey, { start: scheduleStart, end: scheduleEnd });
      remainingHours = roundHours(remainingHours - hoursToSchedule);
      cursor = scheduleEnd;
      scheduledThisDay = true;

      if (remainingHours <= EPSILON) {
        break;
      }
    }

    if (remainingHours <= EPSILON) {
      break;
    }

    if (!scheduledThisDay) {
      cursor = advanceOneDay(cursor);
      continue;
    }

    cursor = advanceOneDay(cursor);
  }

  const lastAssignment = assignments[assignments.length - 1];
  if (!lastAssignment) {
    throw new Error(`Could not schedule stage: ${input.stage}`);
  }

  return {
    worker: input.worker,
    assignments,
    finishTime: new Date(lastAssignment.schedule_end),
  };
}

function buildBusyMap(workerId: Id, assignments: ExistingAssignment[]): BusyMap {
  const busyByDay: BusyMap = new Map();

  for (const a of assignments) {
    if (String(a.worker_id) !== String(workerId)) continue;

    const start = new Date(a.schedule_start);
    const end = new Date(a.schedule_end);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) continue;

    for (const segment of splitRangeByDay(start, end)) {
      addBusyWindow(busyByDay, segment.dateKey, segment.window);
    }
  }

  return busyByDay;
}

function chooseEarliestFinish(candidates: CandidateSchedule[]): CandidateSchedule {
  return [...candidates].sort((a, b) => {
    const diff = a.finishTime.getTime() - b.finishTime.getTime();
    if (diff !== 0) return diff;
    return String(a.worker.name).localeCompare(String(b.worker.name));
  })[0];
}

/** Advance to midnight of the next calendar day. */
function advanceOneDay(date: Date): Date {
  const next = new Date(date);
  next.setHours(0, 0, 0, 0);
  next.setDate(next.getDate() + 1);
  return next;
}

function roundHours(value: number): number {
  return Math.round(value * 100) / 100;
}

const EPSILON = 0.000001;
