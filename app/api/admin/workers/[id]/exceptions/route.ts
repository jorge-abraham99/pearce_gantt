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

export async function POST(
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

  const { exception_type, start_at, end_at, all_day, title, notes } = body as {
    exception_type?: string;
    start_at?: string;
    end_at?: string;
    all_day?: boolean;
    title?: string | null;
    notes?: string | null;
  };

  if (!exception_type || !ALLOWED_TYPES.includes(exception_type)) {
    return NextResponse.json(
      { error: `exception_type must be one of: ${ALLOWED_TYPES.join(", ")}` },
      { status: 400 },
    );
  }
  if (!start_at || !end_at) {
    return NextResponse.json({ error: "start_at and end_at are required" }, { status: 400 });
  }
  const normalizedAllDay = exception_type === "overtime" ? false : (all_day ?? false);
  const validationError = validateExceptionPayload({
    exception_type,
    start_at,
    end_at,
    all_day: normalizedAllDay,
  });
  if (validationError) {
    return NextResponse.json({ error: validationError }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("worker_availability_exceptions")
    .insert({
      worker_id: id,
      exception_type,
      start_at,
      end_at,
      all_day: normalizedAllDay,
      title: title ?? null,
      notes: notes ?? null,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ exception: data }, { status: 201 });
}
