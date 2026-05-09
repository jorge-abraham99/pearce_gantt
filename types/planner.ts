export type Id = number | string;

export type BalerType = {
  id: Id;
  name: string;
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
  workers: Worker[];
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
  balerName: string;
  scheduledStart: string;
  scheduledEnd: string;
  totalScheduledHours: number;
  assignmentsCreated: number;
};
