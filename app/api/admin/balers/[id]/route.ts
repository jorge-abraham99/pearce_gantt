import { NextRequest, NextResponse } from "next/server";

import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

export const dynamic = "force-dynamic";

const STAGES = [
  { stageName: "pressing", sequence: 1 },
  { stageName: "welding", sequence: 2 },
  { stageName: "spraying", sequence: 3 },
  { stageName: "assembling", sequence: 4 },
] as const;

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
  const hours = {
    pressing: Number(pressingHours),
    welding: Number(weldingHours),
    assembling: Number(assemblyHours),
    spraying: Number(sprayingHours),
  };
  for (const [stage, h] of Object.entries(hours)) {
    if (!Number.isFinite(h) || h < 0) {
      return NextResponse.json(
        { error: `${stage} hours must be a non-negative number` },
        { status: 400 },
      );
    }
  }

  const supabase = getSupabaseAdmin();

  // Update baler type name
  const { error: typeErr } = await supabase
    .from("stg_baler_types")
    .update({ name: name.trim(), updated_at: new Date().toISOString() })
    .eq("id", id)
    .is("deleted_at", null);

  if (typeErr) return NextResponse.json({ error: typeErr.message }, { status: 500 });

  // Soft-delete existing active requirements for this baler, then reinsert.
  // This avoids duplicate rows while keeping history (deleted_at set).
  const { error: delErr } = await supabase
    .from("stg_baler_requirements")
    .update({ deleted_at: new Date().toISOString() })
    .eq("baler_type_id", id)
    .is("deleted_at", null);

  if (delErr) return NextResponse.json({ error: delErr.message }, { status: 500 });

  const reqRows = STAGES.map(({ stageName, sequence }) => ({
    baler_type_id: id,
    name: stageName,
    stage_name: stageName,
    stage_sequence: sequence,
    stage_hour_requirements: hours[stageName as keyof typeof hours],
  }));

  const { error: reqErr } = await supabase.from("stg_baler_requirements").insert(reqRows);
  if (reqErr) return NextResponse.json({ error: reqErr.message }, { status: 500 });

  return NextResponse.json({ success: true });
}
