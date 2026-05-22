import { NextRequest, NextResponse } from "next/server";

import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import type { BalerAdminRow } from "@/types/planner";

export const dynamic = "force-dynamic";

function flattenRequirements(
  balerType: { id: number | string; name: string; active: boolean },
  requirements: Array<{ stage_name: string; stage_hour_requirements: number }>,
): BalerAdminRow {
  const get = (stageName: string) =>
    requirements.find((r) => r.stage_name === stageName)?.stage_hour_requirements ?? 0;

  const welding = get("welding");
  const assembly = get("assembling");
  const spraying = get("spraying");

  return {
    id: balerType.id,
    name: balerType.name,
    active: balerType.active,
    weldingHours: welding,
    assemblyHours: assembly,
    sprayingHours: spraying,
    totalHours: welding + assembly + spraying,
  };
}

export async function GET() {
  const supabase = getSupabaseAdmin();

  const [typesRes, reqsRes] = await Promise.all([
    supabase
      .from("stg_baler_types")
      .select("id, name, active")
      .is("deleted_at", null)
      .order("name", { ascending: true }),
    supabase
      .from("stg_baler_requirements")
      .select("id, baler_type_id, stage_name, stage_hour_requirements, stage_sequence")
      .is("deleted_at", null)
      .order("stage_sequence", { ascending: true }),
  ]);

  if (typesRes.error) return NextResponse.json({ error: typesRes.error.message }, { status: 500 });
  if (reqsRes.error) return NextResponse.json({ error: reqsRes.error.message }, { status: 500 });

  const types = typesRes.data ?? [];
  const reqs = reqsRes.data ?? [];

  const balers = types.map((t) =>
    flattenRequirements(
      t,
      reqs.filter((r) => String(r.baler_type_id) === String(t.id)),
    ),
  );

  return NextResponse.json({ balers });
}

export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { name, weldingHours, assemblyHours, sprayingHours } = body as {
    name?: string;
    weldingHours?: number;
    assemblyHours?: number;
    sprayingHours?: number;
  };

  if (!name || typeof name !== "string" || name.trim() === "") {
    return NextResponse.json({ error: "name is required" }, { status: 400 });
  }
  const hours = {
    welding: Number(weldingHours),
    assembling: Number(assemblyHours),
    spraying: Number(sprayingHours),
  };
  for (const [stage, h] of Object.entries(hours)) {
    if (!Number.isFinite(h) || h < 0) {
      return NextResponse.json({ error: `${stage} hours must be a non-negative number` }, { status: 400 });
    }
  }

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase.rpc(
    "admin_create_baler_type_with_requirements",
    {
      p_name: name.trim(),
      p_welding_hours: hours.welding,
      p_assembling_hours: hours.assembling,
      p_spraying_hours: hours.spraying,
    },
  );

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ id: data }, { status: 201 });
}
