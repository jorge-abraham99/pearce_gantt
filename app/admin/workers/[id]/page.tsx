import { notFound } from "next/navigation";

import WorkerProfileShell from "@/components/admin/WorkerProfileShell";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import type { WorkerDetail } from "@/types/planner";

export const dynamic = "force-dynamic";

async function loadWorkerDetail(id: string): Promise<WorkerDetail | null> {
  const supabase = getSupabaseAdmin();

  const [workerRes, skillsRes, scheduleRes, exceptionsRes] = await Promise.all([
    supabase.from("stg_workers").select("*").eq("id", id).is("deleted_at", null).single(),
    supabase
      .from("stg_worker_skills")
      .select("*")
      .eq("worker_id", id)
      .is("deleted_at", null)
      .order("skill"),
    supabase
      .from("worker_default_schedule")
      .select("*")
      .eq("worker_id", id)
      .is("deleted_at", null)
      .order("day_of_week"),
    supabase
      .from("worker_availability_exceptions")
      .select("*")
      .eq("worker_id", id)
      .is("deleted_at", null)
      .order("start_at"),
  ]);

  if (workerRes.error) return null;

  return {
    worker: workerRes.data,
    skills: skillsRes.data ?? [],
    defaultSchedule: scheduleRes.data ?? [],
    exceptions: exceptionsRes.data ?? [],
  };
}

export default async function WorkerProfilePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const detail = await loadWorkerDetail(id);

  if (!detail) notFound();

  return <WorkerProfileShell initialDetail={detail} />;
}
