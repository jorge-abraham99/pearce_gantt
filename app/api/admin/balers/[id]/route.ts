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
      return NextResponse.json(
        { error: `${stage} hours must be a non-negative number` },
        { status: 400 },
      );
    }
  }

  const supabase = getSupabaseAdmin();
  const { error } = await supabase.rpc(
    "admin_update_baler_type_with_requirements",
    {
      p_baler_type_id: Number(id),
      p_name: name.trim(),
      p_welding_hours: hours.welding,
      p_assembling_hours: hours.assembling,
      p_spraying_hours: hours.spraying,
    },
  );

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ success: true });
}
