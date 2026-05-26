import { NextRequest, NextResponse } from "next/server";

import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

export const dynamic = "force-dynamic";

function normalizeSkills(skills: unknown[]): string[] {
  const seen = new Set<string>();
  const normalized: string[] = [];

  for (const value of skills) {
    if (typeof value !== "string") continue;

    const skill = value.trim();
    if (!skill || seen.has(skill)) continue;

    seen.add(skill);
    normalized.push(skill);
  }

  return normalized;
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

  const { skills } = body as { skills?: string[] };
  if (!Array.isArray(skills)) {
    return NextResponse.json({ error: "skills array required" }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();
  const timestamp = new Date().toISOString();
  const workerId = Number(id);
  const selectedSkills = normalizeSkills(skills);

  if (!Number.isInteger(workerId) || workerId <= 0) {
    return NextResponse.json({ error: "Invalid worker id" }, { status: 400 });
  }

  const { error: workerErr } = await supabase
    .from("stg_workers")
    .select("id")
    .eq("id", workerId)
    .is("deleted_at", null)
    .single();

  if (workerErr) {
    const status = workerErr.code === "PGRST116" ? 404 : 500;
    return NextResponse.json({ error: workerErr.message }, { status });
  }

  const { data: existingRows, error: existingErr } = await supabase
    .from("stg_worker_skills")
    .select("id, skill, deleted_at")
    .eq("worker_id", workerId);

  if (existingErr) {
    return NextResponse.json({ error: existingErr.message }, { status: 500 });
  }

  const selectedSet = new Set(selectedSkills);
  const activeIdsToDelete: number[] = [];
  const softDeletedIdsToReactivate: number[] = [];
  const existingSkills = new Set<string>();

  for (const row of existingRows ?? []) {
    const skill = typeof row.skill === "string" ? row.skill : "";
    if (!skill) continue;

    existingSkills.add(skill);

    if (row.deleted_at === null) {
      if (!selectedSet.has(skill)) {
        activeIdsToDelete.push(Number(row.id));
      }
      continue;
    }

    if (selectedSet.has(skill)) {
      softDeletedIdsToReactivate.push(Number(row.id));
    }
  }

  if (activeIdsToDelete.length > 0) {
    const { error: delErr } = await supabase
      .from("stg_worker_skills")
      .update({ deleted_at: timestamp, updated_at: timestamp })
      .in("id", activeIdsToDelete);

    if (delErr) return NextResponse.json({ error: delErr.message }, { status: 500 });
  }

  if (softDeletedIdsToReactivate.length > 0) {
    const { error: reactivateErr } = await supabase
      .from("stg_worker_skills")
      .update({ deleted_at: null, updated_at: timestamp })
      .in("id", softDeletedIdsToReactivate);

    if (reactivateErr) {
      return NextResponse.json({ error: reactivateErr.message }, { status: 500 });
    }
  }

  const rowsToInsert = selectedSkills
    .filter((skill) => !existingSkills.has(skill))
    .map((skill) => ({ worker_id: workerId, skill, name: skill }));

  if (rowsToInsert.length > 0) {
    const { error: insErr } = await supabase.from("stg_worker_skills").insert(rowsToInsert);
    if (insErr) return NextResponse.json({ error: insErr.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
