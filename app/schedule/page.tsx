import SchedulePlanner from "@/components/planner/SchedulePlanner";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import type { BalerType, GanttAssignment } from "@/types/planner";

export const dynamic = "force-dynamic";

async function loadInitialData(): Promise<{
  balerTypes: BalerType[];
  assignments: GanttAssignment[];
  setupError: string | null;
}> {
  try {
    const supabaseAdmin = getSupabaseAdmin();
    const [balerTypesRes, assignmentsRes] = await Promise.all([
      supabaseAdmin
        .from("stg_baler_types")
        .select("id, name")
        .eq("active", true)
        .is("deleted_at", null)
        .order("name", { ascending: true }),
      supabaseAdmin
        .from("vw_gantt_assignments")
        .select("*")
        .order("schedule_start", { ascending: true })
        .order("stage_order", { ascending: true }),
    ]);

    if (balerTypesRes.error) throw balerTypesRes.error;
    if (assignmentsRes.error) throw assignmentsRes.error;

    return {
      balerTypes: balerTypesRes.data ?? [],
      assignments: assignmentsRes.data ?? [],
      setupError: null,
    };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unable to load Supabase data";
    return {
      balerTypes: [],
      assignments: [],
      setupError: message,
    };
  }
}

export default async function SchedulePage() {
  const { balerTypes, assignments, setupError } = await loadInitialData();

  return (
    <>
      {setupError ? (
        <section className="mb-3 rounded-3xl border border-red-200 bg-red-50 p-6 text-red-900">
          <h2 className="font-display text-xl font-semibold">Supabase setup required</h2>
          <p className="mt-1 text-sm">
            Add <code>.env.local</code> with Supabase credentials. Error: {setupError}
          </p>
        </section>
      ) : null}
      <SchedulePlanner
        initialBalerTypes={balerTypes}
        initialAssignments={assignments}
      />
    </>
  );
}
