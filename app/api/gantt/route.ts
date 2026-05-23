import { NextResponse } from "next/server";

import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

export const dynamic = "force-dynamic";

export async function GET() {
  const supabaseAdmin = getSupabaseAdmin();
  const [assignmentsRes, workerSkillsRes] = await Promise.all([
    supabaseAdmin
      .from("vw_gantt_assignments")
      .select("*")
      .order("schedule_start", { ascending: true }),
    supabaseAdmin
      .from("stg_worker_skills")
      .select("*")
      .is("deleted_at", null)
      .order("skill", { ascending: true }),
  ]);

  if (assignmentsRes.error) {
    console.error("[GET /api/gantt] assignments error:", assignmentsRes.error);
    return NextResponse.json(
      { error: "Failed to load gantt data" },
      { status: 500 },
    );
  }

  if (workerSkillsRes.error) {
    console.error("[GET /api/gantt] worker skills error:", workerSkillsRes.error);
    return NextResponse.json(
      { error: "Failed to load worker skills" },
      { status: 500 },
    );
  }

  return NextResponse.json({
    assignments: assignmentsRes.data ?? [],
    workerSkills: workerSkillsRes.data ?? [],
  });
}
