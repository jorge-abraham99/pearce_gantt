import { NextRequest, NextResponse } from "next/server";

import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { calculateHoursPerWeek } from "@/lib/workerHours";

export const dynamic = "force-dynamic";

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

  const { schedule, hours_per_day } = body as {
    schedule?: Array<{
      day_of_week: number;
      is_working: boolean;
      start_time: string | null;
      end_time: string | null;
    }>;
    hours_per_day?: number;
  };

  if (!Array.isArray(schedule) || schedule.length === 0) {
    return NextResponse.json({ error: "schedule array required" }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();
  let fallbackHoursPerDay = hours_per_day;

  if (typeof fallbackHoursPerDay !== "number" || fallbackHoursPerDay <= 0) {
    const { data: worker, error: workerErr } = await supabase
      .from("stg_workers")
      .select("hours_per_day")
      .eq("id", id)
      .is("deleted_at", null)
      .single();

    if (workerErr) {
      const status = workerErr.code === "PGRST116" ? 404 : 500;
      return NextResponse.json({ error: workerErr.message }, { status });
    }

    fallbackHoursPerDay = Number(worker.hours_per_day);
  }

  if (!Number.isFinite(fallbackHoursPerDay) || fallbackHoursPerDay <= 0) {
    return NextResponse.json(
      { error: "hours_per_day must be a positive number" },
      { status: 400 },
    );
  }

  const hoursPerWeek = calculateHoursPerWeek(schedule, fallbackHoursPerDay);

  // Soft-delete existing rows then insert fresh ones to avoid conflict issues
  const { error: delErr } = await supabase
    .from("worker_default_schedule")
    .update({ deleted_at: new Date().toISOString() })
    .eq("worker_id", id)
    .is("deleted_at", null);

  if (delErr) return NextResponse.json({ error: delErr.message }, { status: 500 });

  const rows = schedule.map((row) => ({
    worker_id: id,
    day_of_week: row.day_of_week,
    is_working: row.is_working,
    start_time: row.is_working ? (row.start_time ?? null) : null,
    end_time: row.is_working ? (row.end_time ?? null) : null,
  }));

  const { error: insErr } = await supabase.from("worker_default_schedule").insert(rows);
  if (insErr) return NextResponse.json({ error: insErr.message }, { status: 500 });

  const { error: workerUpdateErr } = await supabase
    .from("stg_workers")
    .update({
      hours_per_week: hoursPerWeek,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .is("deleted_at", null);

  if (workerUpdateErr) {
    return NextResponse.json({ error: workerUpdateErr.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
