import { computePlannedAssignments } from "@/lib/scheduler";
import type {
  BalerRequirement,
  BalerType,
  ExistingAssignment,
  PlannedAssignment,
  SchedulerInput,
} from "@/types/planner";

export type RecalculationAssignment = ExistingAssignment & {
  id: number;
  order_id: number;
  baler_type_id: number;
  baler_name: string;
  stage: string;
  stage_order: number;
  status: string;
};

export type RecalculationOrder = {
  id: number;
  order_number: string;
  customer: string | null;
  baler_type_id: number;
};

export type RecalculationPlan = {
  cutoffAt: string;
  ordersConsidered: number;
  ordersRecalculated: number;
  ordersSkippedStarted: number;
  assignmentsFrozen: number;
  currentMovableAssignments: RecalculationAssignment[];
  assignmentIdsToRemove: number[];
  assignmentsToCreate: Array<
    PlannedAssignment & {
      order_id: number;
      baler_type_id: number;
      baler_name: string;
    }
  >;
  eligibleOrderIds: number[];
  skippedOrderIds: number[];
};

type RecalculationPlannerInput = Pick<
  SchedulerInput,
  | "workers"
  | "workerSkills"
  | "defaultSchedules"
  | "availabilityExceptions"
> & {
  cutoffAt: string;
  assignments: RecalculationAssignment[];
  orders: RecalculationOrder[];
  balerTypes: BalerType[];
  requirements: BalerRequirement[];
};

const FROZEN_STATUSES = new Set(["in_progress", "completed"]);

export function buildFutureScheduleRecalculationPlan(
  input: RecalculationPlannerInput,
): RecalculationPlan {
  const cutoffMs = new Date(input.cutoffAt).getTime();
  if (!Number.isFinite(cutoffMs)) {
    throw new Error("Invalid cutoff timestamp");
  }

  const assignments = input.assignments;
  const movableAssignments = assignments.filter((assignment) =>
    isMovableAssignment(assignment, cutoffMs),
  );

  const candidateOrderIds = uniqueNumbers(
    movableAssignments.map((assignment) => assignment.order_id),
  );

  const frozenOrderIds = new Set<number>();
  for (const assignment of assignments) {
    if (!candidateOrderIds.includes(assignment.order_id)) continue;
    if (isFrozenAssignment(assignment, cutoffMs)) {
      frozenOrderIds.add(assignment.order_id);
    }
  }

  const skippedOrderIds = candidateOrderIds.filter((orderId) =>
    frozenOrderIds.has(orderId),
  );
  const eligibleOrderIds = candidateOrderIds.filter(
    (orderId) => !frozenOrderIds.has(orderId),
  );

  const orderById = new Map(input.orders.map((order) => [order.id, order]));
  const balerTypeById = new Map(
    input.balerTypes.map((balerType) => [Number(balerType.id), balerType]),
  );
  const requirementsByBalerTypeId = new Map<number, BalerRequirement[]>();
  for (const requirement of input.requirements) {
    const key = Number(requirement.baler_type_id);
    const list = requirementsByBalerTypeId.get(key) ?? [];
    list.push(requirement);
    requirementsByBalerTypeId.set(key, list);
  }

  const eligibleAssignments = assignments.filter((assignment) =>
    eligibleOrderIds.includes(assignment.order_id),
  );
  const movableEligibleAssignments = eligibleAssignments.filter((assignment) =>
    isMovableAssignment(assignment, cutoffMs),
  );
  const frozenAssignments = assignments.filter(
    (assignment) => !eligibleOrderIds.includes(assignment.order_id),
  );

  const assignmentIdsToRemove = movableEligibleAssignments
    .map((assignment) => assignment.id)
    .sort((left, right) => left - right);

  const ordersInQueue = eligibleOrderIds
    .map((orderId) => ({
      orderId,
      assignments: movableEligibleAssignments
        .filter((assignment) => assignment.order_id === orderId)
        .sort(
          (left, right) =>
            new Date(left.schedule_start).getTime() -
            new Date(right.schedule_start).getTime(),
        ),
    }))
    .sort((left, right) => {
      const leftStart = new Date(left.assignments[0]?.schedule_start ?? 0).getTime();
      const rightStart = new Date(right.assignments[0]?.schedule_start ?? 0).getTime();
      if (leftStart !== rightStart) return leftStart - rightStart;
      return left.orderId - right.orderId;
    });

  const existingAssignments: ExistingAssignment[] = frozenAssignments.map(
    toExistingAssignment,
  );
  const assignmentsToCreate: RecalculationPlan["assignmentsToCreate"] = [];

  for (const queuedOrder of ordersInQueue) {
    const order = orderById.get(queuedOrder.orderId);
    if (!order) {
      throw new Error(`Missing order metadata for order ${queuedOrder.orderId}`);
    }

    const balerType = balerTypeById.get(order.baler_type_id);
    if (!balerType) {
      throw new Error(
        `Missing baler type ${order.baler_type_id} for order ${order.order_number}`,
      );
    }

    const requirements = requirementsByBalerTypeId.get(order.baler_type_id) ?? [];
    if (requirements.length === 0) {
      throw new Error(`No requirements found for order ${order.order_number}`);
    }

    const startDate = queuedOrder.assignments[0]?.schedule_start;
    if (!startDate) {
      continue;
    }

    const plan = computePlannedAssignments({
      startDate,
      balerType,
      requirements,
      workers: input.workers,
      workerSkills: input.workerSkills,
      defaultSchedules: input.defaultSchedules,
      availabilityExceptions: input.availabilityExceptions,
      existingAssignments,
    });

    const replacementAssignments = plan.assignments.map((assignment) => ({
      ...assignment,
      order_id: order.id,
      baler_type_id: order.baler_type_id,
      baler_name: balerType.name,
    }));

    assignmentsToCreate.push(...replacementAssignments);
    existingAssignments.push(...replacementAssignments.map(toExistingAssignment));
  }

  return {
    cutoffAt: input.cutoffAt,
    ordersConsidered: candidateOrderIds.length,
    ordersRecalculated: eligibleOrderIds.length,
    ordersSkippedStarted: skippedOrderIds.length,
    assignmentsFrozen: frozenAssignments.length,
    currentMovableAssignments: movableEligibleAssignments,
    assignmentIdsToRemove,
    assignmentsToCreate,
    eligibleOrderIds,
    skippedOrderIds,
  };
}

export function hasMaterialScheduleChanges(
  currentAssignments: RecalculationAssignment[],
  replacementAssignments: Array<
    PlannedAssignment & {
      order_id: number;
      baler_type_id: number;
      baler_name: string;
    }
  >,
): boolean {
  const current = normalizeForComparison(currentAssignments);
  const replacement = normalizeForComparison(replacementAssignments);

  if (current.length !== replacement.length) return true;
  return current.some((signature, index) => signature !== replacement[index]);
}

function uniqueNumbers(values: number[]): number[] {
  return Array.from(new Set(values));
}

function normalizeForComparison(
  assignments: Array<{
    order_id: number;
    worker_id: ExistingAssignment["worker_id"];
    baler_name: string;
    baler_type_id: number;
    stage: string;
    stage_order: number;
    schedule_start: string;
    schedule_end: string;
    scheduled_hours: number;
    status?: string | null;
  }>,
): string[] {
  return assignments
    .map((assignment) =>
      [
        assignment.order_id,
        String(assignment.worker_id),
        assignment.baler_name,
        assignment.baler_type_id,
        assignment.stage,
        assignment.stage_order,
        assignment.schedule_start,
        assignment.schedule_end,
        assignment.scheduled_hours,
        assignment.status ?? "scheduled",
      ].join("|"),
    )
    .sort();
}

function isMovableAssignment(
  assignment: Pick<RecalculationAssignment, "status" | "schedule_start">,
  cutoffMs: number,
): boolean {
  return (
    assignment.status === "scheduled" &&
    new Date(assignment.schedule_start).getTime() > cutoffMs
  );
}

function isFrozenAssignment(
  assignment: Pick<RecalculationAssignment, "status" | "schedule_start">,
  cutoffMs: number,
): boolean {
  return (
    new Date(assignment.schedule_start).getTime() <= cutoffMs ||
    FROZEN_STATUSES.has(assignment.status)
  );
}

function toExistingAssignment(
  assignment: {
    id?: number;
    worker_id: ExistingAssignment["worker_id"];
    schedule_start: string;
    schedule_end: string;
    scheduled_hours: number;
    status?: string | null;
  },
): ExistingAssignment {
  return {
    id: assignment.id,
    worker_id: assignment.worker_id,
    schedule_start: assignment.schedule_start,
    schedule_end: assignment.schedule_end,
    scheduled_hours: assignment.scheduled_hours,
    status: assignment.status,
  };
}
