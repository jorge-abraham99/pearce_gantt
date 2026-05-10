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
    <main className="mx-auto flex min-h-screen w-full max-w-[120rem] flex-col gap-4 px-4 py-4 md:px-6">
      {setupError ? (
        <section className="rounded-3xl border border-red-200 bg-red-50 p-6 text-red-900">
          <h2 className="font-display text-2xl font-semibold">
            Supabase setup required
          </h2>
          <p className="mt-2">
            Add `.env.local` and ensure the existing database exposes the
            required source tables, `vw_gantt_assignments`, and `schedule_order`
            RPC. Current load error: {setupError}
          </p>
        </section>
      ) : null}

      <SchedulePlanner
        initialBalerTypes={balerTypes}
        initialAssignments={assignments}
      />
    </main>
  );
}
