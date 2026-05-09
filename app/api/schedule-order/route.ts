import { NextResponse } from "next/server";

import { computePlannedAssignments } from "@/lib/scheduler";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

export const dynamic = "force-dynamic";

type ScheduleRequest = {
  balerTypeId: number | string;
  startDate: string;
};

export async function POST(request: Request) {
  let body: ScheduleRequest;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { balerTypeId, startDate } = body ?? {};
  const numericBalerTypeId = Number(balerTypeId);

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

  const supabaseAdmin = getSupabaseAdmin();
  const [balerTypeRes, requirementsRes, workersRes, existingRes] = await Promise.all([
    supabaseAdmin
      .from("stg_baler_types")
      .select("id, name")
      .eq("id", numericBalerTypeId)
      .is("deleted_at", null)
      .single(),
    supabaseAdmin
      .from("stg_baler_requirements")
      .select("*")
      .eq("baler_type_id", numericBalerTypeId)
      .is("deleted_at", null)
      .order("stage_sequence", { ascending: true }),
    supabaseAdmin.from("int_workers").select("*").is("deleted_at", null),
    supabaseAdmin
      .from("int_operation_assignments")
      .select("id, worker_id, schedule_start, schedule_end, scheduled_hours, status")
      .is("deleted_at", null),
  ]);

  if (balerTypeRes.error || !balerTypeRes.data) {
    return NextResponse.json({ error: "Baler type not found" }, { status: 404 });
  }

  if (requirementsRes.error) {
    console.error("[POST /api/schedule-order] requirements error:", requirementsRes.error);
    return NextResponse.json(
      { error: "Failed to load baler requirements" },
      { status: 500 },
    );
  }

  if (workersRes.error) {
    console.error("[POST /api/schedule-order] workers error:", workersRes.error);
    return NextResponse.json({ error: "Failed to load workers" }, { status: 500 });
  }

  if (existingRes.error) {
    console.error("[POST /api/schedule-order] assignments error:", existingRes.error);
    return NextResponse.json(
      { error: "Failed to load existing assignments" },
      { status: 500 },
    );
  }

  let plan;
  try {
    plan = computePlannedAssignments({
      startDate,
      balerType: balerTypeRes.data,
      requirements: requirementsRes.data ?? [],
      workers: workersRes.data ?? [],
      existingAssignments: existingRes.data ?? [],
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Scheduler failed";
    return NextResponse.json({ error: message }, { status: 422 });
  }

  const { data: rpcData, error: rpcError } = await supabaseAdmin.rpc("schedule_order", {
    p_baler_type_id: numericBalerTypeId,
    p_assignments: plan.assignments,
  });

  if (rpcError || !rpcData) {
    console.error("[POST /api/schedule-order] rpc error:", rpcError);
    return NextResponse.json(
      { error: "Failed to persist scheduled order" },
      { status: 500 },
    );
  }

  const row = Array.isArray(rpcData) ? rpcData[0] : rpcData;

  return NextResponse.json({
    orderId: row.order_id,
    orderNumber: row.order_number,
    balerName: balerTypeRes.data.name,
    scheduledStart: plan.scheduledStart,
    scheduledEnd: plan.scheduledEnd,
    totalScheduledHours: plan.totalScheduledHours,
    assignmentsCreated: row.assignments_created,
  });
}
