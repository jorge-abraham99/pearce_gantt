import { NextRequest, NextResponse } from "next/server";

import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

export const dynamic = "force-dynamic";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const supabase = getSupabaseAdmin();

  const [
    workerRes,
    skillsRes,
    capabilitiesRes,
    scheduleRes,
    exceptionsRes,
    balerTypesRes,
  ] = await Promise.all([
    supabase
      .from("stg_workers")
      .select("*")
      .eq("id", id)
      .is("deleted_at", null)
      .single(),
    supabase
      .from("stg_worker_skills")
      .select("*")
      .eq("worker_id", id)
      .is("deleted_at", null)
      .order("skill"),
    supabase
      .from("worker_baler_type_capabilities")
      .select("*")
      .eq("worker_id", id)
      .is("deleted_at", null),
    supabase
      .from("worker_default_schedule")
      .select("*")
      .eq("worker_id", id)
      .is("deleted_at", null)
      .order("day_of_week"),
    supabase
      .from("worker_availability_exceptions")
      .select("*")
      .eq("worker_id", id)
      .is("deleted_at", null)
      .order("start_at"),
    supabase
      .from("stg_baler_types")
      .select("id, name, active")
      .eq("active", true)
      .is("deleted_at", null)
      .order("name"),
  ]);

  if (workerRes.error) {
    const status = workerRes.error.code === "PGRST116" ? 404 : 500;
    return NextResponse.json({ error: workerRes.error.message }, { status });
  }
  if (skillsRes.error) {
    return NextResponse.json({ error: skillsRes.error.message }, { status: 500 });
  }
  if (capabilitiesRes.error) {
    return NextResponse.json({ error: capabilitiesRes.error.message }, { status: 500 });
  }
  if (scheduleRes.error) {
    return NextResponse.json({ error: scheduleRes.error.message }, { status: 500 });
  }
  if (exceptionsRes.error) {
    return NextResponse.json({ error: exceptionsRes.error.message }, { status: 500 });
  }
  if (balerTypesRes.error) {
    return NextResponse.json({ error: balerTypesRes.error.message }, { status: 500 });
  }

  return NextResponse.json({
    worker: workerRes.data,
    skills: skillsRes.data ?? [],
    balerTypeCapabilities: capabilitiesRes.data ?? [],
    defaultSchedule: scheduleRes.data ?? [],
    exceptions: exceptionsRes.data ?? [],
    availableBalerTypes: balerTypesRes.data ?? [],
  });
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { name, hours_per_day } = body as {
    name?: string;
    hours_per_day?: number;
  };

  const updates: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };
  if (name !== undefined) updates.name = name.trim();
  if (hours_per_day !== undefined) updates.hours_per_day = hours_per_day;

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("stg_workers")
    .update(updates)
    .eq("id", id)
    .is("deleted_at", null)
    .select()
    .single();

  if (error) {
    const status = error.code === "PGRST116" ? 404 : 500;
    return NextResponse.json({ error: error.message }, { status });
  }

  return NextResponse.json({ worker: data });
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const supabase = getSupabaseAdmin();
  const { error } = await supabase
    .from("stg_workers")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id)
    .is("deleted_at", null);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
