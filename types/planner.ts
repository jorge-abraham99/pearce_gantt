export type Id = number | string;

export type BalerType = {
  id: Id;
  name: string;
  active?: boolean | null;
};

export type Customer = {
  id: Id;
  name: string;
  active?: boolean | null;
};

export type Worker = {
  id: Id;
  worker_id?: Id | null;
  name: string;
  hours_per_week?: number | null;
  hours_per_day: number;
  skill_1: string | null;
  skill_2: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  deleted_at?: string | null;
};

export type BalerRequirement = {
  id: Id;
  baler_type_id: Id;
  name?: string | null;
  stage_name: string;
  stage_hour_requirements: number;
  stage_sequence: number;
  created_at?: string | null;
  updated_at?: string | null;
  deleted_at?: string | null;
};

export type ExistingAssignment = {
  id?: Id;
  worker_id: Id;
  schedule_start: string;
  schedule_end: string;
  scheduled_hours: number;
  status?: string | null;
};

export type PlannedAssignment = {
  worker_id: Id;
  stage: string;
  stage_order: number;
  schedule_start: string;
  schedule_end: string;
  scheduled_hours: number;
  status: "scheduled";
};

export type SchedulerInput = {
  startDate: string;
  balerType: BalerType;
  requirements: BalerRequirement[];
  /** Source-of-truth workers from stg_workers */
  workers: StgWorker[];
  /** Skills from stg_worker_skills — one row per worker+skill */
  workerSkills: WorkerSkill[];
  /** Optional worker-to-baler allowlist rows */
  workerBalerTypeCapabilities: WorkerBalerTypeCapability[];
  /** Weekly recurring schedule from worker_default_schedule */
  defaultSchedules: WorkerDefaultSchedule[];
  /** Holidays, overtime, etc. from worker_availability_exceptions */
  availabilityExceptions: WorkerAvailabilityException[];
  existingAssignments: ExistingAssignment[];
};

export type SchedulerOutput = {
  assignments: PlannedAssignment[];
  scheduledStart: string;
  scheduledEnd: string;
  totalScheduledHours: number;
};

export type GanttAssignment = {
  assignment_id: Id;
  worker_id: Id;
  worker_name: string;
  order_id: Id;
  order_number: string;
  customer: string | null;
  baler_type_id: Id;
  baler_name: string;
  stage: string;
  stage_order: number;
  schedule_start: string;
  schedule_end: string;
  scheduled_hours: number;
  status: string;
};

export type ScheduleOrderResponse = {
  orderId: Id;
  orderNumber: string;
  customer: string;
  balerName: string;
  requestedStartDate: string;
  scheduledStart: string;
  scheduledEnd: string;
  scheduledOnRequestedDate: boolean;
  totalScheduledHours: number;
  assignmentsCreated: number;
};

export type RecalculateFutureScheduleResponse = {
  runId: Id;
  cutoffAt: string;
  ordersConsidered: number;
  ordersRecalculated: number;
  ordersSkippedStarted: number;
  assignmentsFrozen: number;
  assignmentsRemoved: number;
  assignmentsCreated: number;
};

// ── Baler admin types ────────────────────────────────────────────────────────

/** Flattened view model for the Balers admin table/modal */
export type BalerAdminRow = {
  id: Id;
  name: string;
  active: boolean;
  weldingHours: number;
  assemblyHours: number; // DB stage_name = "assembling"
  sprayingHours: number;
  totalHours: number;
};

// ── Worker admin types ────────────────────────────────────────────────────────

export type StgWorker = {
  id: Id;
  name: string;
  hours_per_week: number | null;
  hours_per_day: number;
  created_at?: string | null;
  updated_at?: string | null;
  deleted_at?: string | null;
};

export type WorkerSkill = {
  id: Id;
  worker_id: Id;
  name: string | null;
  skill: string;
  created_at?: string | null;
  updated_at?: string | null;
  deleted_at?: string | null;
};

export type WorkerDefaultSchedule = {
  id?: Id;
  worker_id: Id;
  day_of_week: number; // 1=Mon … 7=Sun (ISO)
  is_working: boolean;
  start_time: string | null; // "08:00"
  end_time: string | null;   // "17:00"
};

export type WorkerBalerTypeCapability = {
  id: Id;
  worker_id: Id;
  baler_type_id: Id;
  created_at?: string | null;
  updated_at?: string | null;
  deleted_at?: string | null;
};

export type ExceptionType =
  | "holiday"
  | "sickness"
  | "other_absence"
  | "overtime"
  | "custom_shift"
  | "unavailable";

export type WorkerAvailabilityException = {
  id: Id;
  worker_id: Id;
  exception_type: ExceptionType;
  start_at: string;
  end_at: string;
  all_day: boolean;
  title: string | null;
  notes: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  deleted_at?: string | null;
};

export type WorkerListItem = {
  worker: StgWorker;
  skills: WorkerSkill[];
  balerTypeCapabilities: WorkerBalerTypeCapability[];
  defaultSchedule: WorkerDefaultSchedule[];
  exceptions: WorkerAvailabilityException[];
};

export type WorkerDetail = {
  worker: StgWorker;
  skills: WorkerSkill[];
  balerTypeCapabilities: WorkerBalerTypeCapability[];
  defaultSchedule: WorkerDefaultSchedule[];
  exceptions: WorkerAvailabilityException[];
  availableBalerTypes: BalerType[];
};
