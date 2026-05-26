import { NextRequest, NextResponse } from "next/server";

import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

export const dynamic = "force-dynamic";

function normalizeBalerTypeIds(values: unknown[]): {
  ids: number[];
  hasInvalidEntries: boolean;
} {
  const seen = new Set<number>();
  const normalizedIds: number[] = [];
  let hasInvalidEntries = false;

  for (const value of values) {
    if (!Number.isInteger(value)) {
      hasInvalidEntries = true;
      continue;
    }

    const balerTypeId = Number(value);
    if (balerTypeId <= 0) {
      hasInvalidEntries = true;
      continue;
    }
    if (seen.has(balerTypeId)) continue;

    seen.add(balerTypeId);
    normalizedIds.push(balerTypeId);
  }

  return { ids: normalizedIds, hasInvalidEntries };
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

  const { balerTypeIds } = body as { balerTypeIds?: number[] };
  if (!Array.isArray(balerTypeIds)) {
    return NextResponse.json(
      { error: "balerTypeIds array required" },
      { status: 400 },
    );
  }

  const supabase = getSupabaseAdmin();
  const workerId = Number(id);
  const {
    ids: normalizedBalerTypeIds,
    hasInvalidEntries,
  } = normalizeBalerTypeIds(balerTypeIds);

  if (!Number.isInteger(workerId) || workerId <= 0) {
    return NextResponse.json({ error: "Invalid worker id" }, { status: 400 });
  }

  if (hasInvalidEntries) {
    return NextResponse.json(
      { error: "balerTypeIds must contain only positive integers" },
      { status: 400 },
    );
  }

  const { error } = await supabase.rpc("admin_set_worker_baler_type_capabilities", {
    p_worker_id: workerId,
    p_baler_type_ids: normalizedBalerTypeIds,
  });

  if (error) {
    const status =
      error.code === "P0002" ? 404 :
      error.code === "22023" ? 400 :
      500;
    return NextResponse.json({ error: error.message }, { status });
  }

  return NextResponse.json({ success: true });
}
