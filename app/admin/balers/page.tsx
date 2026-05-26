import BalersAdminShell from "@/components/admin/BalersAdminShell";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import type { BalerAdminRow } from "@/types/planner";

export const dynamic = "force-dynamic";

async function loadBalers(): Promise<{ balers: BalerAdminRow[]; error: string | null }> {
  try {
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

    if (typesRes.error) throw typesRes.error;
    if (reqsRes.error) throw reqsRes.error;

    const types = typesRes.data ?? [];
    const reqs = reqsRes.data ?? [];

    const balers: BalerAdminRow[] = types.map((t) => {
      const mine = reqs.filter((r) => String(r.baler_type_id) === String(t.id));
      const get = (s: string) =>
        mine.find((r) => r.stage_name === s)?.stage_hour_requirements ?? 0;

      const welding = get("welding");
      const assembly = get("assembling");
      const spraying = get("spraying");

      return {
        id: t.id,
        name: t.name,
        active: t.active,
        weldingHours: welding,
        assemblyHours: assembly,
        sprayingHours: spraying,
        totalHours: welding + assembly + spraying,
      };
    });

    return { balers, error: null };
  } catch (err) {
    return {
      balers: [],
      error: err instanceof Error ? err.message : "Failed to load machines",
    };
  }
}

export default async function BalersAdminPage() {
  const { balers, error } = await loadBalers();

  return (
    <>
      {error ? (
        <section className="mb-3 rounded-3xl border border-red-200 bg-red-50 p-6 text-red-900">
          <h2 className="font-display text-xl font-semibold">Failed to load machines</h2>
          <p className="mt-1 text-sm">{error}</p>
        </section>
      ) : null}
      <BalersAdminShell initialBalers={balers} />
    </>
  );
}
