import { NextRequest, NextResponse } from "next/server";

import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

export const dynamic = "force-dynamic";

const ALLOWED_TYPES = ["holiday", "overtime", "custom_shift", "unavailable"];

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

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("worker_availability_exceptions")
    .insert({
      worker_id: id,
      exception_type,
      start_at,
      end_at,
      all_day: all_day ?? false,
      title: title ?? null,
      notes: notes ?? null,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ exception: data }, { status: 201 });
}
