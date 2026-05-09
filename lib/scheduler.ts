import { addHours, atStartOfWorkday, dateKeyToWorkday, getWorkDate } from "@/lib/dates";
import type {
  ExistingAssignment,
  PlannedAssignment,
  SchedulerInput,
  SchedulerOutput,
  Worker,
} from "@/types/planner";

type CandidateSchedule = {
  worker: Worker;
  assignments: PlannedAssignment[];
  finishTime: Date;
};

type BusyMap = Map<string, number>;

const EPSILON = 0.000001;

export function getWorkerCapacityForDate(worker: Worker, date: Date): number {
  const day = date.getDay();
  if (day === 0 || day === 6) return 0;
  return Number(worker.hours_per_day) || 0;
}

export function computePlannedAssignments(input: SchedulerInput): SchedulerOutput {
  const requirements = [...input.requirements].sort(
    (left, right) => left.stage_sequence - right.stage_sequence,
  );

  if (requirements.length === 0) {
    throw new Error(`No requirements found for baler type: ${input.balerType.name}`);
  }

  const workingAssignments: ExistingAssignment[] = [...input.existingAssignments];
  const plannedAssignments: PlannedAssignment[] = [];
  let previousStageFinish = atStartOfWorkday(input.startDate);

  for (const requirement of requirements) {
    const requiredHours = Number(requirement.stage_hour_requirements);
    if (!Number.isFinite(requiredHours) || requiredHours <= 0) {
      throw new Error(`Invalid hour requirement for stage: ${requirement.stage_name}`);
    }

    const eligibleWorkers = input.workers.filter((worker) =>
      [worker.skill_1, worker.skill_2].includes(requirement.stage_name),
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
    scheduledStart: plannedAssignments[0]?.schedule_start ?? previousStageFinish.toISOString(),
    scheduledEnd:
      plannedAssignments[plannedAssignments.length - 1]?.schedule_end ??
      previousStageFinish.toISOString(),
    totalScheduledHours: roundHours(
      plannedAssignments.reduce((total, assignment) => total + assignment.scheduled_hours, 0),
    ),
  };
}

function simulateWorkerSchedule(input: {
  worker: Worker;
  stage: string;
  stageOrder: number;
  requiredHours: number;
  notBefore: Date;
  existingAssignments: ExistingAssignment[];
}): CandidateSchedule {
  const busyByDay = buildBusyMap(input.worker.id, input.existingAssignments);
  const assignments: PlannedAssignment[] = [];
  let remainingHours = input.requiredHours;
  let cursor = moveToWorkingTime(input.notBefore);

  while (remainingHours > EPSILON) {
    const dateKey = getWorkDate(cursor);
    const dayStart = dateKeyToWorkday(dateKey);
    const capacity = getWorkerCapacityForDate(input.worker, dayStart);

    if (capacity <= 0) {
      cursor = advanceOneDay(dayStart);
      continue;
    }

    const bookedHours = busyByDay.get(dateKey) ?? 0;
    const cursorHours = Math.max(0, hoursSince(dayStart, cursor));
    const startOffsetHours = Math.max(bookedHours, cursorHours);
    const availableHours = Math.max(0, capacity - startOffsetHours);

    if (availableHours <= EPSILON) {
      cursor = advanceOneDay(dayStart);
      continue;
    }

    const hoursToSchedule = Math.min(remainingHours, availableHours);
    const scheduleStart = addHours(dayStart, startOffsetHours);
    const scheduleEnd = addHours(scheduleStart, hoursToSchedule);

    assignments.push({
      worker_id: input.worker.id,
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

function buildBusyMap(workerId: Worker["id"], assignments: ExistingAssignment[]): BusyMap {
  const busyByDay: BusyMap = new Map();

  for (const assignment of assignments) {
    if (String(assignment.worker_id) !== String(workerId)) continue;

    const dateKey = getWorkDate(assignment.schedule_start);
    const current = busyByDay.get(dateKey) ?? 0;
    busyByDay.set(dateKey, current + Number(assignment.scheduled_hours || 0));
  }

  return busyByDay;
}

function chooseEarliestFinish(candidates: CandidateSchedule[]): CandidateSchedule {
  return [...candidates].sort((left, right) => {
    const finishDiff = left.finishTime.getTime() - right.finishTime.getTime();
    if (finishDiff !== 0) return finishDiff;
    return String(left.worker.name).localeCompare(String(right.worker.name));
  })[0];
}

function advanceOneDay(date: Date): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + 1);
  return atStartOfWorkday(next);
}

function moveToWorkingTime(date: Date): Date {
  const normalized = new Date(date);

  if (normalized.getDay() === 0 || normalized.getDay() === 6) {
    return atStartOfWorkday(normalized);
  }

  const start = atStartOfWorkday(normalized);
  return normalized.getTime() < start.getTime() ? start : normalized;
}

function hoursSince(start: Date, end: Date): number {
  return (end.getTime() - start.getTime()) / (60 * 60 * 1000);
}

function roundHours(value: number): number {
  return Math.round(value * 100) / 100;
}
