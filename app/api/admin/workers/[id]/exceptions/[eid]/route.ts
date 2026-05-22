import { NextRequest, NextResponse } from "next/server";

import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

export const dynamic = "force-dynamic";

const ALLOWED_TYPES = [
  "holiday",
  "sickness",
  "other_absence",
  "overtime",
  "custom_shift",
  "unavailable",
];

function validateExceptionPayload(input: {
  exception_type: string;
  start_at: string;
  end_at: string;
  all_day: boolean;
}): string | null {
  const start = new Date(input.start_at);
  const end = new Date(input.end_at);

  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    return "start_at and end_at must be valid ISO datetime strings";
  }

  if (end.getTime() <= start.getTime()) {
    return "end_at must be after start_at";
  }

  if (input.exception_type === "overtime") {
    if (input.all_day) {
      return "overtime cannot be saved as all_day";
    }
    if (input.start_at.slice(0, 10) !== input.end_at.slice(0, 10)) {
      return "overtime must start and end on the same date";
    }
  }

  return null;
}

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
  const supabase = getSupabaseAdmin();
  const { data: existing, error: existingError } = await supabase
    .from("worker_availability_exceptions")
    .select("exception_type, start_at, end_at, all_day")
    .eq("id", eid)
    .eq("worker_id", id)
    .is("deleted_at", null)
    .single();

  if (existingError || !existing) {
    const status = existingError?.code === "PGRST116" ? 404 : 500;
    return NextResponse.json(
      { error: existingError?.message ?? "Exception not found" },
      { status },
    );
  }

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

  const normalizedExceptionType =
    exception_type ?? String(existing.exception_type);
  const normalizedStartAt = start_at ?? String(existing.start_at);
  const normalizedEndAt = end_at ?? String(existing.end_at);
  const normalizedAllDay =
    normalizedExceptionType === "overtime"
      ? false
      : (all_day ?? Boolean(existing.all_day));
  const validationError = validateExceptionPayload({
    exception_type: normalizedExceptionType,
    start_at: normalizedStartAt,
    end_at: normalizedEndAt,
    all_day: normalizedAllDay,
  });

  if (validationError) {
    return NextResponse.json({ error: validationError }, { status: 400 });
  }

  updates.all_day = normalizedAllDay;

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
