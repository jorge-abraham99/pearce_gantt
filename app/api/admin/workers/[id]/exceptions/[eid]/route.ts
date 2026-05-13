import { NextRequest, NextResponse } from "next/server";

import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

export const dynamic = "force-dynamic";

const ALLOWED_TYPES = ["holiday", "overtime", "custom_shift", "unavailable"];

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; eid: string }> },
) {
  const { id, eid } = await params;
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { exception_type, start_at, end_at, all_day, title, notes } = body as {
    exception_type?: string;
    start_at?: string;
    end_at?: string;
    all_day?: boolean;
    title?: string | null;
    notes?: string | null;
  };

  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };

  if (exception_type !== undefined) {
    if (!ALLOWED_TYPES.includes(exception_type)) {
      return NextResponse.json({ error: "Invalid exception_type" }, { status: 400 });
    }
    updates.exception_type = exception_type;
  }
  if (start_at !== undefined) updates.start_at = start_at;
  if (end_at !== undefined) updates.end_at = end_at;
  if (all_day !== undefined) updates.all_day = all_day;
  if (title !== undefined) updates.title = title;
  if (notes !== undefined) updates.notes = notes;

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("worker_availability_exceptions")
    .update(updates)
    .eq("id", eid)
    .eq("worker_id", id)
    .is("deleted_at", null)
    .select()
    .single();

  if (error) {
    const status = error.code === "PGRST116" ? 404 : 500;
    return NextResponse.json({ error: error.message }, { status });
  }

  return NextResponse.json({ exception: data });
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; eid: string }> },
) {
  const { id, eid } = await params;
  const supabase = getSupabaseAdmin();
  const { error } = await supabase
    .from("worker_availability_exceptions")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", eid)
    .eq("worker_id", id)
    .is("deleted_at", null);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
