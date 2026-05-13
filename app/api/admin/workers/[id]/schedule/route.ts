import { NextRequest, NextResponse } from "next/server";

import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

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

  const { schedule } = body as {
    schedule?: Array<{
      day_of_week: number;
      is_working: boolean;
      start_time: string | null;
      end_time: string | null;
    }>;
  };

  if (!Array.isArray(schedule) || schedule.length === 0) {
    return NextResponse.json({ error: "schedule array required" }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();

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

  return NextResponse.json({ success: true });
}
