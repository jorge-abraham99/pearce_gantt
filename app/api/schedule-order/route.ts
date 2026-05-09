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

  const orderNumber = createOrderNumber();
  const { data: order, error: orderError } = await supabaseAdmin
    .from("stg_orders")
    .insert({
      order_number: orderNumber,
      baler_type: balerTypeRes.data.name,
      baler_type_id: numericBalerTypeId,
      status: "scheduled",
    })
    .select("id, order_number")
    .single();

  if (orderError || !order) {
    console.error("[POST /api/schedule-order] order insert error:", orderError);
    return NextResponse.json(
      { error: "Failed to create scheduled order" },
      { status: 500 },
    );
  }

  const assignmentRows = plan.assignments.map((assignment) => ({
    ...assignment,
    order_id: order.id,
    baler_name: balerTypeRes.data.name,
    baler_type_id: numericBalerTypeId,
  }));

  const { error: assignmentsError } = await supabaseAdmin
    .from("int_operation_assignments")
    .insert(assignmentRows);

  if (assignmentsError) {
    console.error("[POST /api/schedule-order] assignment insert error:", assignmentsError);
    await supabaseAdmin
      .from("stg_orders")
      .update({
        status: "failed",
        deleted_at: new Date().toISOString(),
      })
      .eq("id", order.id);

    return NextResponse.json(
      { error: "Failed to persist scheduled assignments" },
      { status: 500 },
    );
  }

  return NextResponse.json({
    orderId: order.id,
    orderNumber: order.order_number,
    balerName: balerTypeRes.data.name,
    scheduledStart: plan.scheduledStart,
    scheduledEnd: plan.scheduledEnd,
    totalScheduledHours: plan.totalScheduledHours,
    assignmentsCreated: assignmentRows.length,
  });
}

function createOrderNumber() {
  const now = new Date();
  const stamp = [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, "0"),
    String(now.getDate()).padStart(2, "0"),
    String(now.getHours()).padStart(2, "0"),
    String(now.getMinutes()).padStart(2, "0"),
    String(now.getSeconds()).padStart(2, "0"),
  ].join("");

  return `O${stamp}`;
}
