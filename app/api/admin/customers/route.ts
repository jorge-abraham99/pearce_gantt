import { NextRequest, NextResponse } from "next/server";

import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import type { Customer } from "@/types/planner";

export const dynamic = "force-dynamic";

type CustomerNameUpdate = {
  id: number | string;
  name: string;
};

async function loadCustomers(): Promise<
  | { customers: Customer[]; error: null }
  | { customers: null; error: string }
> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("stg_customers")
    .select("*")
    .eq("active", true)
    .is("deleted_at", null)
    .order("name", { ascending: true });

  if (error) {
    return { customers: null, error: error.message };
  }

  return { customers: (data ?? []) as Customer[], error: null };
}

export async function GET() {
  const result = await loadCustomers();
  if (result.error) {
    return NextResponse.json({ error: result.error }, { status: 500 });
  }

  return NextResponse.json({ customers: result.customers });
}

export async function PUT(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const updatesInput = (body as { customers?: unknown }).customers;
  if (!Array.isArray(updatesInput)) {
    return NextResponse.json(
      { error: "customers must be an array" },
      { status: 400 },
    );
  }

  const dedupedUpdates = new Map<string, CustomerNameUpdate>();
  for (const item of updatesInput) {
    const candidate = item as { id?: unknown; name?: unknown };
    if (
      candidate === null ||
      typeof candidate !== "object" ||
      candidate.id === undefined ||
      candidate.id === null
    ) {
      return NextResponse.json(
        { error: "Each customer update must include an id" },
        { status: 400 },
      );
    }

    const name =
      typeof candidate.name === "string" ? candidate.name.trim() : "";
    if (name === "") {
      return NextResponse.json(
        { error: "Customer names must be non-empty strings" },
        { status: 400 },
      );
    }

    dedupedUpdates.set(String(candidate.id), {
      id: candidate.id as number | string,
      name,
    });
  }

  if (dedupedUpdates.size === 0) {
    const result = await loadCustomers();
    if (result.error) {
      return NextResponse.json({ error: result.error }, { status: 500 });
    }
    return NextResponse.json({ customers: result.customers });
  }

  const supabase = getSupabaseAdmin();
  const ids = Array.from(dedupedUpdates.values()).map((item) => item.id);

  const { data: existingCustomers, error: existingError } = await supabase
    .from("stg_customers")
    .select("id, name")
    .in("id", ids)
    .eq("active", true)
    .is("deleted_at", null);

  if (existingError) {
    return NextResponse.json({ error: existingError.message }, { status: 500 });
  }

  const existingIds = new Set(
    (existingCustomers ?? []).map((customer) => String(customer.id)),
  );

  for (const id of ids) {
    if (!existingIds.has(String(id))) {
      return NextResponse.json(
        { error: `Customer ${id} was not found` },
        { status: 404 },
      );
    }
  }

  const currentNames = new Map(
    (existingCustomers ?? []).map((customer) => [
      String(customer.id),
      customer.name as string,
    ]),
  );
  const targetNames = new Map<string, string>();

  for (const update of dedupedUpdates.values()) {
    targetNames.set(String(update.id), update.name);
  }

  const { data: allCustomers, error: allCustomersError } = await supabase
    .from("stg_customers")
    .select("id, name")
    .eq("active", true)
    .is("deleted_at", null);

  if (allCustomersError) {
    return NextResponse.json({ error: allCustomersError.message }, { status: 500 });
  }

  const normalizedNames = new Map<string, string>();
  for (const customer of allCustomers ?? []) {
    const nextName = targetNames.get(String(customer.id)) ?? String(customer.name);
    const normalized = nextName.trim().toLowerCase();
    const conflictId = normalizedNames.get(normalized);
    if (conflictId && conflictId !== String(customer.id)) {
      return NextResponse.json(
        { error: `Customer name "${nextName}" already exists` },
        { status: 400 },
      );
    }
    normalizedNames.set(normalized, String(customer.id));
  }

  const updatedAt = new Date().toISOString();
  for (const update of dedupedUpdates.values()) {
    const currentName = currentNames.get(String(update.id));
    if (!currentName || currentName === update.name) {
      continue;
    }

    const { error: customerError } = await supabase
      .from("stg_customers")
      .update({
        name: update.name,
        updated_at: updatedAt,
      })
      .eq("id", update.id)
      .eq("active", true)
      .is("deleted_at", null);

    if (customerError) {
      return NextResponse.json({ error: customerError.message }, { status: 500 });
    }

    const { error: ordersError } = await supabase
      .from("stg_orders")
      .update({
        customer: update.name,
        updated_at: updatedAt,
      })
      .eq("customer", currentName)
      .is("deleted_at", null);

    if (ordersError) {
      return NextResponse.json({ error: ordersError.message }, { status: 500 });
    }
  }

  const result = await loadCustomers();
  if (result.error) {
    return NextResponse.json({ error: result.error }, { status: 500 });
  }

  return NextResponse.json({ customers: result.customers });
}
