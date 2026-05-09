import BalerScheduleForm from "@/components/BalerScheduleForm";
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
        .order("schedule_start", { ascending: true }),
    ]);

    if (balerTypesRes.error) throw balerTypesRes.error;
    if (assignmentsRes.error) throw assignmentsRes.error;

    return {
      balerTypes: balerTypesRes.data ?? [],
      assignments: assignmentsRes.data ?? [],
      setupError: null,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to load Supabase data";
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
    <main className="mx-auto flex min-h-screen w-full max-w-7xl flex-col gap-8 px-5 py-8 md:px-10">
      <section className="rounded-[2rem] border border-[var(--line)] bg-[var(--panel)] p-8 shadow-panel backdrop-blur md:p-12">
        <div className="max-w-3xl">
          <p className="mb-3 text-sm font-semibold uppercase tracking-[0.24em] text-[var(--accent)]">
            Pearce Planner Demo
          </p>
          <h1 className="font-display text-5xl font-semibold tracking-tight md:text-7xl">
            Schedule a baler and see the shop floor load.
          </h1>
          <p className="mt-5 max-w-2xl text-lg leading-8 text-[var(--muted)]">
            Pick a start date and baler type. The scheduler creates sequenced work blocks
            across eligible workers, then renders them as a simple Gantt.
          </p>
        </div>
      </section>

      {setupError ? (
        <section className="rounded-3xl border border-red-200 bg-red-50 p-6 text-red-900">
          <h2 className="font-display text-2xl font-semibold">Supabase setup required</h2>
          <p className="mt-2">
            Add `.env.local` and ensure the existing database exposes the required source
            tables, `vw_gantt_assignments`, and `schedule_order` RPC. Current load error:{" "}
            {setupError}
          </p>
        </section>
      ) : null}

      <BalerScheduleForm initialBalerTypes={balerTypes} initialAssignments={assignments} />
    </main>
  );
}
