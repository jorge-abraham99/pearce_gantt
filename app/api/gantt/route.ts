import { NextResponse } from "next/server";

import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

export const dynamic = "force-dynamic";

export async function GET() {
  const supabaseAdmin = getSupabaseAdmin();
  const { data, error } = await supabaseAdmin
    .from("vw_gantt_assignments")
    .select("*")
    .order("schedule_start", { ascending: true });

  if (error) {
    console.error("[GET /api/gantt] supabase error:", error);
    return NextResponse.json({ error: "Failed to load gantt data" }, { status: 500 });
  }

  return NextResponse.json({ assignments: data ?? [] });
}
