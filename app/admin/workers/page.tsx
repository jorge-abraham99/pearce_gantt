import WorkersAdminShell from "@/components/admin/WorkersAdminShell";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import type { BalerType, WorkerListItem } from "@/types/planner";

export const dynamic = "force-dynamic";

async function loadWorkers(): Promise<{
  workers: WorkerListItem[];
  balerTypes: BalerType[];
  error: string | null;
}> {
  try {
    const supabase = getSupabaseAdmin();

    const [
      workersRes,
      skillsRes,
      capabilitiesRes,
      scheduleRes,
      exceptionsRes,
      balerTypesRes,
    ] = await Promise.all([
      supabase
        .from("stg_workers")
        .select("*")
        .is("deleted_at", null)
        .order("name", { ascending: true }),
      supabase
        .from("stg_worker_skills")
        .select("*")
        .is("deleted_at", null)
        .order("skill", { ascending: true }),
      supabase
        .from("worker_baler_type_capabilities")
        .select("*")
        .is("deleted_at", null),
      supabase
        .from("worker_default_schedule")
        .select("*")
        .is("deleted_at", null)
        .order("day_of_week", { ascending: true }),
      supabase
        .from("worker_availability_exceptions")
        .select("*")
        .is("deleted_at", null)
        .order("start_at", { ascending: true }),
      supabase
        .from("stg_baler_types")
        .select("id, name, active")
        .eq("active", true)
        .is("deleted_at", null)
        .order("name", { ascending: true }),
    ]);

    if (workersRes.error) throw workersRes.error;
    if (skillsRes.error) throw skillsRes.error;
    if (capabilitiesRes.error) throw capabilitiesRes.error;
    if (scheduleRes.error) throw scheduleRes.error;
    if (exceptionsRes.error) throw exceptionsRes.error;
    if (balerTypesRes.error) throw balerTypesRes.error;

    const ws = workersRes.data ?? [];
    const sk = skillsRes.data ?? [];
    const caps = capabilitiesRes.data ?? [];
    const sc = scheduleRes.data ?? [];
    const ex = exceptionsRes.data ?? [];
    const balerTypes = balerTypesRes.data ?? [];

    const workers = ws.map((w) => ({
      worker: w,
      skills: sk.filter((s) => String(s.worker_id) === String(w.id)),
      balerTypeCapabilities: caps.filter((c) => String(c.worker_id) === String(w.id)),
      defaultSchedule: sc.filter((s) => String(s.worker_id) === String(w.id)),
      exceptions: ex.filter((e) => String(e.worker_id) === String(w.id)),
    }));

    return { workers, balerTypes, error: null };
  } catch (err) {
    return {
      workers: [],
      balerTypes: [],
      error: err instanceof Error ? err.message : "Failed to load workers",
    };
  }
}

export default async function WorkersAdminPage() {
  const { workers, balerTypes, error } = await loadWorkers();

  return (
    <>
      {error ? (
        <section className="mb-3 rounded-3xl border border-red-200 bg-red-50 p-6 text-red-900">
          <h2 className="font-display text-xl font-semibold">Failed to load workers</h2>
          <p className="mt-1 text-sm">{error}</p>
        </section>
      ) : null}
      <WorkersAdminShell initialWorkers={workers} initialBalerTypes={balerTypes} />
    </>
  );
}
