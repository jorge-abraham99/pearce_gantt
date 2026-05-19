import {
  WORKDAY_START_HOUR,
  addHours,
  getWorkDate,
  parseDateOnlyAsLocal,
} from "@/lib/dates";
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

type DayCapacity = {
  availableHours: number;
  dayStart: Date; // actual workday start for this worker on this date
};

type CandidateSchedule = {
  worker: EnrichedWorker;
  assignments: PlannedAssignment[];
  finishTime: Date;
};

type BusyMap = Map<string, number>;

// ── Skill normalisation ───────────────────────────────────────────────────────

// Common aliases so that e.g. "press" stored in stg_worker_skills matches
// "pressing" used as a stage name in stg_baler_requirements.
const SKILL_ALIASES: Record<string, string> = {
  press: "pressing",
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

function exceptionCoversDateKey(
  ex: WorkerAvailabilityException,
  dateKey: string,
): boolean {
  const midnight = parseDateOnlyAsLocal(dateKey);
  const dayEnd = new Date(midnight);
  dayEnd.setHours(23, 59, 59, 999);
  return new Date(ex.start_at) <= dayEnd && new Date(ex.end_at) >= midnight;
}

/**
 * Returns how many hours this worker can work on a given date, plus the
 * actual timestamp when their workday starts on that date.
 *
 * Priority:
 *  1. absence exceptions → 0 hours
 *  2. worker_default_schedule for that day_of_week
 *  3. fallback to hours_per_day at WORKDAY_START_HOUR if no schedule row exists
 *  4. overtime / custom_shift exceptions add extra hours on top of the base
 */
export function getWorkerDayCapacity(
  worker: EnrichedWorker,
  dateKey: string,
): DayCapacity {
  const midnight = parseDateOnlyAsLocal(dateKey);
  const fallbackStart = addHours(midnight, WORKDAY_START_HOUR);
  const dayOfWeek = isoWeekday(midnight);

  const onDate = worker.exceptions.filter((e) =>
    exceptionCoversDateKey(e, dateKey),
  );

  if (
    onDate.some(
      (e) =>
        e.exception_type === "holiday" ||
        e.exception_type === "sickness" ||
        e.exception_type === "other_absence" ||
        e.exception_type === "unavailable",
    )
  ) {
    return { availableHours: 0, dayStart: fallbackStart };
  }

  const daySchedule = worker.defaultSchedule.find(
    (s) => s.day_of_week === dayOfWeek,
  );

  let baseHours: number;
  let startHour: number;

  if (!daySchedule) {
    // No schedule data at all — fall back to hours_per_day at default start
    startHour = WORKDAY_START_HOUR;
    baseHours = worker.hours_per_day;
  } else if (!daySchedule.is_working) {
    return { availableHours: 0, dayStart: fallbackStart };
  } else {
    startHour = daySchedule.start_time
      ? timeToHours(daySchedule.start_time)
      : WORKDAY_START_HOUR;
    const endHour = daySchedule.end_time
      ? timeToHours(daySchedule.end_time)
      : startHour + worker.hours_per_day;
    baseHours = endHour - startHour;
  }

  const extraHours = onDate
    .filter(
      (e) =>
        e.exception_type === "overtime" || e.exception_type === "custom_shift",
    )
    .reduce(
      (acc, e) =>
        acc +
        Math.max(
          0,
          (new Date(e.end_at).getTime() - new Date(e.start_at).getTime()) /
            3_600_000,
        ),
      0,
    );

  return {
    availableHours: Math.max(0, baseHours) + extraHours,
    dayStart: addHours(midnight, startHour),
  };
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
    const { availableHours: capacity, dayStart } = getWorkerDayCapacity(
      input.worker,
      dateKey,
    );

    if (capacity <= 0) {
      cursor = advanceOneDay(cursor);
      continue;
    }

    const bookedHours = busyByDay.get(dateKey) ?? 0;
    const cursorHours = Math.max(0, hoursSince(dayStart, cursor));
    const startOffsetHours = Math.max(bookedHours, cursorHours);
    const availableHours = Math.max(0, capacity - startOffsetHours);

    if (availableHours <= EPSILON) {
      cursor = advanceOneDay(cursor);
      continue;
    }

    const hoursToSchedule = Math.min(remainingHours, availableHours);
    const scheduleStart = addHours(dayStart, startOffsetHours);
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

    busyByDay.set(dateKey, bookedHours + hoursToSchedule);
    remainingHours = roundHours(remainingHours - hoursToSchedule);
    cursor = scheduleEnd;
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
    const dateKey = getWorkDate(a.schedule_start);
    const current = busyByDay.get(dateKey) ?? 0;
    busyByDay.set(dateKey, current + Number(a.scheduled_hours || 0));
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

function hoursSince(start: Date, end: Date): number {
  return (end.getTime() - start.getTime()) / (60 * 60 * 1000);
}

function roundHours(value: number): number {
  return Math.round(value * 100) / 100;
}

const EPSILON = 0.000001;
