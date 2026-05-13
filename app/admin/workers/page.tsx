import WorkersAdminShell from "@/components/admin/WorkersAdminShell";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import type { WorkerListItem } from "@/types/planner";

export const dynamic = "force-dynamic";

async function loadWorkers(): Promise<{ workers: WorkerListItem[]; error: string | null }> {
  try {
    const supabase = getSupabaseAdmin();

    const [workersRes, skillsRes, scheduleRes, exceptionsRes] = await Promise.all([
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
        .from("worker_default_schedule")
        .select("*")
        .is("deleted_at", null)
        .order("day_of_week", { ascending: true }),
      supabase
        .from("worker_availability_exceptions")
        .select("*")
        .is("deleted_at", null)
        .order("start_at", { ascending: true }),
    ]);

    if (workersRes.error) throw workersRes.error;
    if (skillsRes.error) throw skillsRes.error;
    if (scheduleRes.error) throw scheduleRes.error;
    if (exceptionsRes.error) throw exceptionsRes.error;

    const ws = workersRes.data ?? [];
    const sk = skillsRes.data ?? [];
    const sc = scheduleRes.data ?? [];
    const ex = exceptionsRes.data ?? [];

    const workers = ws.map((w) => ({
      worker: w,
      skills: sk.filter((s) => String(s.worker_id) === String(w.id)),
      defaultSchedule: sc.filter((s) => String(s.worker_id) === String(w.id)),
      exceptions: ex.filter((e) => String(e.worker_id) === String(w.id)),
    }));

    return { workers, error: null };
  } catch (err) {
    return {
      workers: [],
      error: err instanceof Error ? err.message : "Failed to load workers",
    };
  }
}

export default async function WorkersAdminPage() {
  const { workers, error } = await loadWorkers();

  return (
    <main className="flex min-h-[calc(100vh-4rem)] flex-col gap-4">
      {error ? (
        <section className="rounded-3xl border border-red-200 bg-red-50 p-6 text-red-900">
          <h2 className="font-display text-xl font-semibold">Failed to load workers</h2>
          <p className="mt-1 text-sm">{error}</p>
        </section>
      ) : null}
      <WorkersAdminShell initialWorkers={workers} />
    </main>
  );
}
