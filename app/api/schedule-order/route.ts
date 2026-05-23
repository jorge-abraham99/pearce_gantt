import { NextResponse } from "next/server";

import { computePlannedAssignments } from "@/lib/scheduler";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import type { PlannedAssignment, SchedulerInput } from "@/types/planner";

export const dynamic = "force-dynamic";

const MAX_SCHEDULE_ATTEMPTS = 3;
const SCHEDULE_OVERLAP_ERROR_CODE = "23P01";
const SCHEDULE_OVERLAP_CONSTRAINT = "int_operation_assignments_no_worker_overlap";
const MISSING_RPC_ERROR_CODE = "PGRST202";

type ScheduleRequest = {
  balerTypeId: number | string;
  customer: string;
  startDate: string;
};

type ScheduleSnapshot = Pick<
  SchedulerInput,
  | "balerType"
  | "requirements"
  | "workers"
  | "workerSkills"
  | "defaultSchedules"
  | "availabilityExceptions"
  | "existingAssignments"
>;

type PersistedSchedule = {
  orderId: number;
  orderNumber: string;
  assignmentsCreated: number;
};

export async function POST(request: Request) {
  let body: ScheduleRequest;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { balerTypeId, customer, startDate } = body ?? {};
  const numericBalerTypeId = Number(balerTypeId);
  const trimmedCustomer = typeof customer === "string" ? customer.trim() : "";

  if (
    (typeof balerTypeId !== "number" && typeof balerTypeId !== "string") ||
    String(balerTypeId).trim() === "" ||
    !Number.isFinite(numericBalerTypeId)
  ) {
    return NextResponse.json({ error: "balerTypeId must be a number" }, { status: 400 });
  }

  if (typeof startDate !== "string" || Number.isNaN(Date.parse(startDate))) {
    return NextResponse.json(
      { error: "startDate must be an ISO date string" },
      { status: 400 },
    );
  }

  if (trimmedCustomer === "") {
    return NextResponse.json(
      { error: "customer must be selected" },
      { status: 400 },
    );
  }

  const supabaseAdmin = getSupabaseAdmin();
  let customerEnsured = false;

  for (let attempt = 1; attempt <= MAX_SCHEDULE_ATTEMPTS; attempt += 1) {
    const snapshot = await loadScheduleSnapshot(
      supabaseAdmin,
      numericBalerTypeId,
    );

    if ("response" in snapshot) {
      return snapshot.response;
    }

    if (!customerEnsured) {
      const customerError = await ensureCustomerExists(
        supabaseAdmin,
        trimmedCustomer,
      );
      if (customerError) {
        return NextResponse.json({ error: customerError }, { status: 500 });
      }
      customerEnsured = true;
    }

    let plan;
    try {
      plan = computePlannedAssignments({
        startDate,
        ...snapshot,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Scheduler failed";
      return NextResponse.json({ error: message }, { status: 422 });
    }

    const persisted = await persistScheduleAtomically({
      supabaseAdmin,
      balerTypeId: numericBalerTypeId,
      balerName: snapshot.balerType.name,
      customer: trimmedCustomer,
      assignments: plan.assignments,
    });

    if ("response" in persisted) {
      if (persisted.retryableConflict && attempt < MAX_SCHEDULE_ATTEMPTS) {
        console.warn(
          `[POST /api/schedule-order] overlap conflict on attempt ${attempt}; retrying with fresh assignments`,
        );
        continue;
      }
      return persisted.response;
    }

    return NextResponse.json({
      orderId: persisted.orderId,
      orderNumber: persisted.orderNumber,
      customer: trimmedCustomer,
      balerName: snapshot.balerType.name,
      requestedStartDate: startDate,
      scheduledStart: plan.scheduledStart,
      scheduledEnd: plan.scheduledEnd,
      scheduledOnRequestedDate:
        plan.scheduledStart.slice(0, 10) === startDate,
      totalScheduledHours: plan.totalScheduledHours,
      assignmentsCreated: persisted.assignmentsCreated,
    });
  }

  return NextResponse.json({
    error: "Scheduling conflicted with another request. Please retry.",
  }, { status: 409 });
}

async function loadScheduleSnapshot(
  supabaseAdmin: ReturnType<typeof getSupabaseAdmin>,
  balerTypeId: number,
): Promise<ScheduleSnapshot | { response: NextResponse }> {
  const [
    balerTypeRes,
    requirementsRes,
    workersRes,
    workerSkillsRes,
    defaultSchedulesRes,
    exceptionsRes,
    existingRes,
  ] = await Promise.all([
    supabaseAdmin
      .from("stg_baler_types")
      .select("id, name")
      .eq("id", balerTypeId)
      .is("deleted_at", null)
      .single(),

    supabaseAdmin
      .from("stg_baler_requirements")
      .select("*")
      .eq("baler_type_id", balerTypeId)
      .is("deleted_at", null)
      .order("stage_sequence", { ascending: true }),

    supabaseAdmin
      .from("stg_workers")
      .select("id, name, hours_per_day, hours_per_week")
      .is("deleted_at", null),

    supabaseAdmin
      .from("stg_worker_skills")
      .select("id, worker_id, skill, name")
      .is("deleted_at", null),

    supabaseAdmin
      .from("worker_default_schedule")
      .select("id, worker_id, day_of_week, is_working, start_time, end_time")
      .is("deleted_at", null),

    supabaseAdmin
      .from("worker_availability_exceptions")
      .select("id, worker_id, exception_type, start_at, end_at, all_day, title, notes")
      .is("deleted_at", null),

    supabaseAdmin
      .from("int_operation_assignments")
      .select("id, worker_id, schedule_start, schedule_end, scheduled_hours, status")
      .is("deleted_at", null),
  ]);

  if (balerTypeRes.error || !balerTypeRes.data) {
    return {
      response: NextResponse.json({ error: "Baler type not found" }, { status: 404 }),
    };
  }
  if (requirementsRes.error) {
    console.error("[POST /api/schedule-order] requirements error:", requirementsRes.error);
    return {
      response: NextResponse.json({ error: "Failed to load baler requirements" }, { status: 500 }),
    };
  }
  if (workersRes.error) {
    console.error("[POST /api/schedule-order] workers error:", workersRes.error);
    return {
      response: NextResponse.json({ error: "Failed to load workers" }, { status: 500 }),
    };
  }
  if (workerSkillsRes.error) {
    console.error("[POST /api/schedule-order] skills error:", workerSkillsRes.error);
    return {
      response: NextResponse.json({ error: "Failed to load worker skills" }, { status: 500 }),
    };
  }
  if (defaultSchedulesRes.error) {
    console.error("[POST /api/schedule-order] schedules error:", defaultSchedulesRes.error);
    return {
      response: NextResponse.json({ error: "Failed to load worker schedules" }, { status: 500 }),
    };
  }
  if (exceptionsRes.error) {
    console.error("[POST /api/schedule-order] exceptions error:", exceptionsRes.error);
    return {
      response: NextResponse.json({ error: "Failed to load availability exceptions" }, { status: 500 }),
    };
  }
  if (existingRes.error) {
    console.error("[POST /api/schedule-order] assignments error:", existingRes.error);
    return {
      response: NextResponse.json({ error: "Failed to load existing assignments" }, { status: 500 }),
    };
  }

  return {
    balerType: balerTypeRes.data,
    requirements: requirementsRes.data ?? [],
    workers: workersRes.data ?? [],
    workerSkills: workerSkillsRes.data ?? [],
    defaultSchedules: defaultSchedulesRes.data ?? [],
    availabilityExceptions: exceptionsRes.data ?? [],
    existingAssignments: existingRes.data ?? [],
  };
}

async function persistScheduleAtomically(input: {
  supabaseAdmin: ReturnType<typeof getSupabaseAdmin>;
  balerTypeId: number;
  balerName: string;
  customer: string;
  assignments: PlannedAssignment[];
}): Promise<
  | PersistedSchedule
  | { response: NextResponse; retryableConflict: boolean }
> {
  const { data, error } = await input.supabaseAdmin.rpc(
    "schedule_order_atomic",
    {
      p_baler_type_id: input.balerTypeId,
      p_baler_name: input.balerName,
      p_customer: input.customer,
      p_assignments: input.assignments,
    },
  );

  if (error) {
    if (isMissingScheduleOrderAtomicError(error)) {
      console.error("[POST /api/schedule-order] missing schedule_order_atomic rpc:", error);
      return {
        response: NextResponse.json(
          {
            error:
              "Database migration missing: schedule_order_atomic is not installed. Apply migrations/002_schedule_order_atomic.sql before scheduling.",
          },
          { status: 500 },
        ),
        retryableConflict: false,
      };
    }

    if (isScheduleOverlapConflict(error)) {
      return {
        response: NextResponse.json(
          { error: "Scheduling conflicted with another request. Please retry." },
          { status: 409 },
        ),
        retryableConflict: true,
      };
    }

    console.error("[POST /api/schedule-order] atomic rpc error:", error);
    return {
      response: NextResponse.json(
        { error: "Failed to persist scheduled order" },
        { status: 500 },
      ),
      retryableConflict: false,
    };
  }

  const row = Array.isArray(data) ? data[0] : data;
  if (!row) {
    console.error("[POST /api/schedule-order] atomic rpc returned no row");
    return {
      response: NextResponse.json(
        { error: "Failed to persist scheduled order" },
        { status: 500 },
      ),
      retryableConflict: false,
    };
  }

  return {
    orderId: Number(row.order_id),
    orderNumber: String(row.order_number),
    assignmentsCreated: Number(row.assignments_created ?? input.assignments.length),
  };
}

function isScheduleOverlapConflict(error: {
  code?: string;
  message?: string;
  details?: string;
} | null | undefined): boolean {
  if (!error) return false;
  if (error.code === SCHEDULE_OVERLAP_ERROR_CODE) return true;

  const text = `${error.message ?? ""} ${error.details ?? ""}`.toLowerCase();
  return text.includes(SCHEDULE_OVERLAP_CONSTRAINT.toLowerCase());
}

function isMissingScheduleOrderAtomicError(error: {
  code?: string;
  message?: string;
  details?: string;
} | null | undefined): boolean {
  if (!error) return false;
  if (error.code !== MISSING_RPC_ERROR_CODE) return false;

  const text = `${error.message ?? ""} ${error.details ?? ""}`.toLowerCase();
  return text.includes("schedule_order_atomic");
}

async function ensureCustomerExists(
  supabaseAdmin: ReturnType<typeof getSupabaseAdmin>,
  customerName: string,
): Promise<string | null> {
  const { data: existing, error: lookupError } = await supabaseAdmin
    .from("stg_customers")
    .select("id")
    .eq("name", customerName)
    .is("deleted_at", null)
    .limit(1)
    .maybeSingle();

  if (lookupError) {
    console.error("[POST /api/schedule-order] customer lookup error:", lookupError);
    return "Failed to check customer";
  }

  if (existing) return null;

  const { error: insertError } = await supabaseAdmin
    .from("stg_customers")
    .insert({
      name: customerName,
      active: true,
    });

  if (insertError) {
    console.error("[POST /api/schedule-order] customer insert error:", insertError);
    return "Failed to create customer";
  }

  return null;
}
