import { NextRequest, NextResponse } from "next/server";

import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import type { BalerAdminRow } from "@/types/planner";

export const dynamic = "force-dynamic";

// Canonical stage config — order must stay consistent with scheduler expectations
const STAGES = [
  { stageName: "pressing", sequence: 1 },
  { stageName: "welding", sequence: 2 },
  { stageName: "spraying", sequence: 3 },
  { stageName: "assembling", sequence: 4 },
] as const;

function flattenRequirements(
  balerType: { id: number | string; name: string; active: boolean },
  requirements: Array<{ stage_name: string; stage_hour_requirements: number }>,
): BalerAdminRow {
  const get = (stageName: string) =>
    requirements.find((r) => r.stage_name === stageName)?.stage_hour_requirements ?? 0;

  const pressing = get("pressing");
  const welding = get("welding");
  const assembly = get("assembling");
  const spraying = get("spraying");

  return {
    id: balerType.id,
    name: balerType.name,
    active: balerType.active,
    pressingHours: pressing,
    weldingHours: welding,
    assemblyHours: assembly,
    sprayingHours: spraying,
    totalHours: pressing + welding + assembly + spraying,
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

  const { name, pressingHours, weldingHours, assemblyHours, sprayingHours } = body as {
    name?: string;
    pressingHours?: number;
    weldingHours?: number;
    assemblyHours?: number;
    sprayingHours?: number;
  };

  if (!name || typeof name !== "string" || name.trim() === "") {
    return NextResponse.json({ error: "name is required" }, { status: 400 });
  }
  const hours = { pressing: Number(pressingHours), welding: Number(weldingHours), assembling: Number(assemblyHours), spraying: Number(sprayingHours) };
  for (const [stage, h] of Object.entries(hours)) {
    if (!Number.isFinite(h) || h < 0) {
      return NextResponse.json({ error: `${stage} hours must be a non-negative number` }, { status: 400 });
    }
  }

  const supabase = getSupabaseAdmin();

  const { data: balerType, error: typeErr } = await supabase
    .from("stg_baler_types")
    .insert({ name: name.trim(), active: true })
    .select("id")
    .single();

  if (typeErr || !balerType) {
    return NextResponse.json({ error: typeErr?.message ?? "Failed to create baler type" }, { status: 500 });
  }

  const reqRows = STAGES.map(({ stageName, sequence }) => ({
    baler_type_id: balerType.id,
    name: stageName,
    stage_name: stageName,
    stage_sequence: sequence,
    stage_hour_requirements: hours[stageName as keyof typeof hours],
  }));

  const { error: reqErr } = await supabase.from("stg_baler_requirements").insert(reqRows);
  if (reqErr) return NextResponse.json({ error: reqErr.message }, { status: 500 });

  return NextResponse.json({ id: balerType.id }, { status: 201 });
}
