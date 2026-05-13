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

  const { skills } = body as { skills?: string[] };
  if (!Array.isArray(skills)) {
    return NextResponse.json({ error: "skills array required" }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();

  // Soft-delete all existing skills for this worker
  const { error: delErr } = await supabase
    .from("stg_worker_skills")
    .update({ deleted_at: new Date().toISOString() })
    .eq("worker_id", id)
    .is("deleted_at", null);

  if (delErr) return NextResponse.json({ error: delErr.message }, { status: 500 });

  if (skills.length > 0) {
    const rows = skills.map((skill) => ({ worker_id: id, skill, name: skill }));
    const { error: insErr } = await supabase.from("stg_worker_skills").insert(rows);
    if (insErr) return NextResponse.json({ error: insErr.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
