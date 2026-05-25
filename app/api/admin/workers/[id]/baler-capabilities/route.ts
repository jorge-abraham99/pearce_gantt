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

  const { balerTypeIds } = body as { balerTypeIds?: number[] };
  if (!Array.isArray(balerTypeIds)) {
    return NextResponse.json(
      { error: "balerTypeIds array required" },
      { status: 400 },
    );
  }

  const supabase = getSupabaseAdmin();
  const timestamp = new Date().toISOString();

  const { error: delErr } = await supabase
    .from("worker_baler_type_capabilities")
    .update({ deleted_at: timestamp, updated_at: timestamp })
    .eq("worker_id", id)
    .is("deleted_at", null);

  if (delErr) return NextResponse.json({ error: delErr.message }, { status: 500 });

  if (balerTypeIds.length > 0) {
    const rows = balerTypeIds.map((balerTypeId) => ({
      worker_id: id,
      baler_type_id: balerTypeId,
    }));
    const { error: insErr } = await supabase
      .from("worker_baler_type_capabilities")
      .insert(rows);
    if (insErr) return NextResponse.json({ error: insErr.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
