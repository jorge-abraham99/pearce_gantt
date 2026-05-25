import { NextResponse } from "next/server";

import { formatLocalDateTime } from "@/lib/dates";
import {
  buildFutureScheduleRecalculationPlan,
  hasMaterialScheduleChanges,
} from "@/lib/recalculateFutureSchedule";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import type {
  BalerRequirement,
  BalerType,
  RecalculateFutureScheduleResponse,
  StgWorker,
  WorkerAvailabilityException,
  WorkerBalerTypeCapability,
  WorkerDefaultSchedule,
  WorkerSkill,
} from "@/types/planner";

export const dynamic = "force-dynamic";

const MAX_RECALCULATION_ATTEMPTS = 3;
const OVERLAP_ERROR_CODE = "23P01";
const STALE_RECALCULATION_ERROR_CODE = "P0001";
const OVERLAP_CONSTRAINT = "int_operation_assignments_no_worker_overlap";
const STALE_RECALCULATION_MESSAGE = "future assignment set changed during recalculation";
const MISSING_RPC_ERROR_CODE = "PGRST202";

type RecalculationRunStatus = "running" | "succeeded" | "failed";

type RecalculationRunBody = {
  triggeredBy?: string;
};

type ScheduleAssignmentRow = {
  id: number;
  order_id: number;
  worker_id: number;
  baler_name: string;
  baler_type_id: number;
  stage: string;
  stage_order: number;
  schedule_start: string;
  schedule_end: string;
  scheduled_hours: number;
  status: string;
};

type ScheduleOrderRow = {
  id: number;
  order_number: string;
  customer: string | null;
  baler_type_id: number;
};

type RecalculationSnapshot = {
  assignments: ScheduleAssignmentRow[];
  orders: ScheduleOrderRow[];
  balerTypes: BalerType[];
  requirements: BalerRequirement[];
  workers: StgWorker[];
  workerSkills: WorkerSkill[];
  workerBalerTypeCapabilities: WorkerBalerTypeCapability[];
  defaultSchedules: WorkerDefaultSchedule[];
  availabilityExceptions: WorkerAvailabilityException[];
};

type RunSummary = Omit<RecalculateFutureScheduleResponse, "runId">;

const EMPTY_SUMMARY: RunSummary = {
  cutoffAt: "",
  ordersConsidered: 0,
  ordersRecalculated: 0,
  ordersSkippedStarted: 0,
  assignmentsFrozen: 0,
  assignmentsRemoved: 0,
  assignmentsCreated: 0,
};

export async function POST(request: Request) {
  const body = await parseBody(request);
  if ("response" in body) {
    return body.response;
  }

  const supabaseAdmin = getSupabaseAdmin();
  const cutoffAt = formatLocalDateTime(new Date());
  const triggeredBy = body.triggeredBy?.trim() || "planner_ui";
  let runId: number | null = null;
  let lastSummary: RunSummary = { ...EMPTY_SUMMARY, cutoffAt };

  try {
    runId = await createRecalculationRun(supabaseAdmin, cutoffAt, triggeredBy);

    for (
      let attempt = 1;
      attempt <= MAX_RECALCULATION_ATTEMPTS;
      attempt += 1
    ) {
      const snapshot = await loadRecalculationSnapshot(supabaseAdmin);

      const plan = buildFutureScheduleRecalculationPlan({
        cutoffAt,
        assignments: snapshot.assignments,
        orders: snapshot.orders,
        balerTypes: snapshot.balerTypes,
        requirements: snapshot.requirements,
        workers: snapshot.workers,
        workerSkills: snapshot.workerSkills,
        workerBalerTypeCapabilities: snapshot.workerBalerTypeCapabilities,
        defaultSchedules: snapshot.defaultSchedules,
        availabilityExceptions: snapshot.availabilityExceptions,
      });

      lastSummary = {
        cutoffAt,
        ordersConsidered: plan.ordersConsidered,
        ordersRecalculated: plan.ordersRecalculated,
        ordersSkippedStarted: plan.ordersSkippedStarted,
        assignmentsFrozen: plan.assignmentsFrozen,
        assignmentsRemoved: 0,
        assignmentsCreated: 0,
      };

      if (plan.ordersRecalculated === 0) {
        await finalizeRecalculationRun(supabaseAdmin, runId, "succeeded", {
          ...lastSummary,
          details: {
            eligibleOrderIds: plan.eligibleOrderIds,
            skippedOrderIds: plan.skippedOrderIds,
          },
        });
        return NextResponse.json({ runId, ...lastSummary });
      }

      if (
        !hasMaterialScheduleChanges(
          plan.currentMovableAssignments,
          plan.assignmentsToCreate,
        )
      ) {
        await finalizeRecalculationRun(supabaseAdmin, runId, "succeeded", {
          ...lastSummary,
          details: {
            eligibleOrderIds: plan.eligibleOrderIds,
            skippedOrderIds: plan.skippedOrderIds,
            noChanges: true,
          },
        });
        return NextResponse.json({ runId, ...lastSummary });
      }

      const replacement = await replaceFutureAssignmentsAtomically(
        supabaseAdmin,
        cutoffAt,
        plan.assignmentIdsToRemove,
        plan.assignmentsToCreate,
      );

      if ("response" in replacement) {
        if (replacement.retryableConflict && attempt < MAX_RECALCULATION_ATTEMPTS) {
          console.warn(
            `[POST /api/recalculate-future-schedule] retryable conflict on attempt ${attempt}; retrying`,
          );
          continue;
        }

        await finalizeRecalculationRun(supabaseAdmin, runId, "failed", {
          ...lastSummary,
          errorMessage: replacement.errorMessage,
          details: {
            eligibleOrderIds: plan.eligibleOrderIds,
            skippedOrderIds: plan.skippedOrderIds,
          },
        });
        return replacement.response;
      }

      const responsePayload: RecalculateFutureScheduleResponse = {
        runId,
        cutoffAt,
        ordersConsidered: plan.ordersConsidered,
        ordersRecalculated: plan.ordersRecalculated,
        ordersSkippedStarted: plan.ordersSkippedStarted,
        assignmentsFrozen: plan.assignmentsFrozen,
        assignmentsRemoved: replacement.assignmentsRemoved,
        assignmentsCreated: replacement.assignmentsCreated,
      };

      await finalizeRecalculationRun(supabaseAdmin, runId, "succeeded", {
        ...responsePayload,
        details: {
          eligibleOrderIds: plan.eligibleOrderIds,
          skippedOrderIds: plan.skippedOrderIds,
        },
      });

      return NextResponse.json(responsePayload);
    }

    const conflictMessage =
      "Scheduling conflicted with another request. Please retry recalculation.";
    await finalizeRecalculationRun(supabaseAdmin, runId, "failed", {
      ...lastSummary,
      errorMessage: conflictMessage,
    });
    return NextResponse.json({ error: conflictMessage }, { status: 409 });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Failed to recalculate future schedule";
    if (runId !== null) {
      await finalizeRecalculationRun(supabaseAdmin, runId, "failed", {
        ...lastSummary,
        errorMessage: message,
      });
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

async function parseBody(
  request: Request,
): Promise<RecalculationRunBody | { response: NextResponse }> {
  const raw = await request.text();
  if (!raw.trim()) return {};

  try {
    const body = JSON.parse(raw) as RecalculationRunBody;
    return body ?? {};
  } catch {
    return {
      response: NextResponse.json({ error: "Invalid JSON body" }, { status: 400 }),
    };
  }
}

async function createRecalculationRun(
  supabaseAdmin: ReturnType<typeof getSupabaseAdmin>,
  cutoffAt: string,
  triggeredBy: string,
): Promise<number> {
  const { data, error } = await supabaseAdmin
    .from("schedule_recalculation_runs")
    .insert({
      cutoff_at: cutoffAt,
      triggered_by: triggeredBy,
      status: "running",
    })
    .select("id")
    .single();

  if (error || !data) {
    console.error(
      "[POST /api/recalculate-future-schedule] create run error:",
      error,
    );
    throw new Error("Failed to create recalculation audit row");
  }

  return Number(data.id);
}

async function finalizeRecalculationRun(
  supabaseAdmin: ReturnType<typeof getSupabaseAdmin>,
  runId: number,
  status: RecalculationRunStatus,
  input: RunSummary & {
    errorMessage?: string;
    details?: Record<string, unknown>;
  },
) {
  const { error } = await supabaseAdmin
    .from("schedule_recalculation_runs")
    .update({
      finished_at: formatLocalDateTime(new Date()),
      status,
      orders_considered: input.ordersConsidered,
      orders_recalculated: input.ordersRecalculated,
      orders_skipped_started: input.ordersSkippedStarted,
      assignments_frozen: input.assignmentsFrozen,
      assignments_removed: input.assignmentsRemoved,
      assignments_created: input.assignmentsCreated,
      error_message: input.errorMessage ?? null,
      details: input.details ?? null,
    })
    .eq("id", runId);

  if (error) {
    console.error(
      "[POST /api/recalculate-future-schedule] finalize run error:",
      error,
    );
  }
}

async function loadRecalculationSnapshot(
  supabaseAdmin: ReturnType<typeof getSupabaseAdmin>,
): Promise<RecalculationSnapshot> {
  const [
    assignmentsRes,
    workersRes,
    workerSkillsRes,
    workerCapabilitiesRes,
    defaultSchedulesRes,
    exceptionsRes,
  ] = await Promise.all([
    supabaseAdmin
      .from("int_operation_assignments")
      .select(
        "id, order_id, worker_id, baler_name, baler_type_id, stage, stage_order, schedule_start, schedule_end, scheduled_hours, status",
      )
      .is("deleted_at", null),
    supabaseAdmin
      .from("stg_workers")
      .select("id, name, hours_per_day, hours_per_week")
      .is("deleted_at", null),
    supabaseAdmin
      .from("stg_worker_skills")
      .select("id, worker_id, skill, name")
      .is("deleted_at", null),
    supabaseAdmin
      .from("worker_baler_type_capabilities")
      .select("id, worker_id, baler_type_id")
      .is("deleted_at", null),
    supabaseAdmin
      .from("worker_default_schedule")
      .select("id, worker_id, day_of_week, is_working, start_time, end_time")
      .is("deleted_at", null),
    supabaseAdmin
      .from("worker_availability_exceptions")
      .select("id, worker_id, exception_type, start_at, end_at, all_day, title, notes")
      .is("deleted_at", null),
  ]);

  if (assignmentsRes.error) throw new Error("Failed to load existing assignments");
  if (workersRes.error) throw new Error("Failed to load workers");
  if (workerSkillsRes.error) throw new Error("Failed to load worker skills");
  if (workerCapabilitiesRes.error) {
    throw new Error("Failed to load worker baler capabilities");
  }
  if (defaultSchedulesRes.error) throw new Error("Failed to load worker schedules");
  if (exceptionsRes.error) {
    throw new Error("Failed to load worker availability exceptions");
  }

  const assignments = (assignmentsRes.data ?? []) as ScheduleAssignmentRow[];
  const orderIds = uniqueNumbers(assignments.map((assignment) => assignment.order_id));
  if (orderIds.length === 0) {
    return {
      assignments,
      orders: [],
      balerTypes: [],
      requirements: [],
      workers: (workersRes.data ?? []) as StgWorker[],
      workerSkills: (workerSkillsRes.data ?? []) as WorkerSkill[],
      workerBalerTypeCapabilities:
        (workerCapabilitiesRes.data ?? []) as WorkerBalerTypeCapability[],
      defaultSchedules: (defaultSchedulesRes.data ?? []) as WorkerDefaultSchedule[],
      availabilityExceptions:
        (exceptionsRes.data ?? []) as WorkerAvailabilityException[],
    };
  }

  const ordersRes = await supabaseAdmin
    .from("stg_orders")
    .select("id, order_number, customer, baler_type_id")
    .in("id", orderIds)
    .is("deleted_at", null);

  if (ordersRes.error) throw new Error("Failed to load active orders");

  const orders = (ordersRes.data ?? []) as ScheduleOrderRow[];
  const balerTypeIds = uniqueNumbers(orders.map((order) => order.baler_type_id));

  const [balerTypesRes, requirementsRes] = await Promise.all([
    balerTypeIds.length === 0
      ? Promise.resolve({ data: [], error: null })
      : supabaseAdmin
          .from("stg_baler_types")
          .select("id, name")
          .in("id", balerTypeIds)
          .is("deleted_at", null),
    balerTypeIds.length === 0
      ? Promise.resolve({ data: [], error: null })
      : supabaseAdmin
          .from("stg_baler_requirements")
          .select("*")
          .in("baler_type_id", balerTypeIds)
          .is("deleted_at", null)
          .order("stage_sequence", { ascending: true }),
  ]);

  if (balerTypesRes.error) throw new Error("Failed to load baler types");
  if (requirementsRes.error) throw new Error("Failed to load baler requirements");

  return {
    assignments,
    orders,
    balerTypes: (balerTypesRes.data ?? []) as BalerType[],
    requirements: (requirementsRes.data ?? []) as BalerRequirement[],
    workers: (workersRes.data ?? []) as StgWorker[],
    workerSkills: (workerSkillsRes.data ?? []) as WorkerSkill[],
    workerBalerTypeCapabilities:
      (workerCapabilitiesRes.data ?? []) as WorkerBalerTypeCapability[],
    defaultSchedules: (defaultSchedulesRes.data ?? []) as WorkerDefaultSchedule[],
    availabilityExceptions:
      (exceptionsRes.data ?? []) as WorkerAvailabilityException[],
  };
}

async function replaceFutureAssignmentsAtomically(
  supabaseAdmin: ReturnType<typeof getSupabaseAdmin>,
  cutoffAt: string,
  assignmentIdsToRemove: number[],
  assignmentsToCreate: Array<{
    order_id: number;
    worker_id: number | string;
    baler_name: string;
    baler_type_id: number;
    stage: string;
    stage_order: number;
    schedule_start: string;
    schedule_end: string;
    scheduled_hours: number;
    status: "scheduled";
  }>,
): Promise<
  | { assignmentsRemoved: number; assignmentsCreated: number }
  | { response: NextResponse; retryableConflict: boolean; errorMessage: string }
> {
  const { data, error } = await supabaseAdmin.rpc(
    "replace_future_schedule_atomic",
    {
      p_assignment_ids_to_remove: assignmentIdsToRemove,
      p_cutoff_at: cutoffAt,
      p_new_assignments: assignmentsToCreate,
    },
  );

  if (error) {
    if (isMissingReplacementRpc(error)) {
      return {
        response: NextResponse.json(
          {
            error:
              "Database migration missing: replace_future_schedule_atomic is not installed.",
          },
          { status: 500 },
        ),
        retryableConflict: false,
        errorMessage:
          "Database migration missing: replace_future_schedule_atomic is not installed.",
      };
    }

    if (isRetryableConflict(error)) {
      return {
        response: NextResponse.json(
          {
            error:
              "Future schedule changed while recalculating. Please retry the recalculation.",
          },
          { status: 409 },
        ),
        retryableConflict: true,
        errorMessage:
          "Future schedule changed while recalculating. Please retry the recalculation.",
      };
    }

    console.error(
      "[POST /api/recalculate-future-schedule] replacement rpc error:",
      error,
    );
    return {
      response: NextResponse.json(
        { error: "Failed to replace future schedule" },
        { status: 500 },
      ),
      retryableConflict: false,
      errorMessage: "Failed to replace future schedule",
    };
  }

  const row = Array.isArray(data) ? data[0] : data;
  if (!row) {
    return {
      response: NextResponse.json(
        { error: "Failed to replace future schedule" },
        { status: 500 },
      ),
      retryableConflict: false,
      errorMessage: "Failed to replace future schedule",
    };
  }

  return {
    assignmentsRemoved: Number(row.assignments_removed ?? 0),
    assignmentsCreated: Number(row.assignments_created ?? 0),
  };
}

function isRetryableConflict(error: {
  code?: string;
  message?: string;
  details?: string;
} | null | undefined): boolean {
  if (!error) return false;
  if (error.code === OVERLAP_ERROR_CODE) return true;
  if (error.code === STALE_RECALCULATION_ERROR_CODE) return true;

  const text = `${error.message ?? ""} ${error.details ?? ""}`.toLowerCase();
  return (
    text.includes(OVERLAP_CONSTRAINT.toLowerCase()) ||
    text.includes(STALE_RECALCULATION_MESSAGE)
  );
}

function isMissingReplacementRpc(error: {
  code?: string;
  message?: string;
  details?: string;
} | null | undefined): boolean {
  if (!error) return false;
  if (error.code !== MISSING_RPC_ERROR_CODE) return false;
  const text = `${error.message ?? ""} ${error.details ?? ""}`.toLowerCase();
  return text.includes("replace_future_schedule_atomic");
}

function uniqueNumbers(values: number[]): number[] {
  return Array.from(new Set(values));
}
