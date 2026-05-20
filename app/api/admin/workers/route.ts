import { NextRequest, NextResponse } from "next/server";

import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { calculateHoursPerWeek } from "@/lib/workerHours";

export const dynamic = "force-dynamic";

export async function GET() {
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

  if (workersRes.error)
    return NextResponse.json({ error: workersRes.error.message }, { status: 500 });
  if (skillsRes.error)
    return NextResponse.json({ error: skillsRes.error.message }, { status: 500 });
  if (scheduleRes.error)
    return NextResponse.json({ error: scheduleRes.error.message }, { status: 500 });
  if (exceptionsRes.error)
    return NextResponse.json({ error: exceptionsRes.error.message }, { status: 500 });

  const workers = workersRes.data ?? [];
  const skills = skillsRes.data ?? [];
  const schedules = scheduleRes.data ?? [];
  const exceptions = exceptionsRes.data ?? [];

  const items = workers.map((w) => ({
    worker: w,
    skills: skills.filter((s) => String(s.worker_id) === String(w.id)),
    defaultSchedule: schedules.filter((s) => String(s.worker_id) === String(w.id)),
    exceptions: exceptions.filter((e) => String(e.worker_id) === String(w.id)),
  }));

  return NextResponse.json({ workers: items });
}

export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { name, hours_per_day, skills, defaultSchedule } = body as {
    name?: string;
    hours_per_day?: number;
    skills?: string[];
    defaultSchedule?: Array<{
      day_of_week: number;
      is_working: boolean;
      start_time?: string | null;
      end_time?: string | null;
    }>;
  };

  if (!name || typeof name !== "string" || name.trim() === "") {
    return NextResponse.json({ error: "name is required" }, { status: 400 });
  }
  if (typeof hours_per_day !== "number" || hours_per_day <= 0) {
    return NextResponse.json(
      { error: "hours_per_day must be a positive number" },
      { status: 400 },
    );
  }

  const supabase = getSupabaseAdmin();
  const hoursPerWeek = calculateHoursPerWeek(defaultSchedule, hours_per_day);

  const { data: worker, error: workerErr } = await supabase
    .from("stg_workers")
    .insert({
      name: name.trim(),
      hours_per_day,
      hours_per_week: hoursPerWeek,
    })
    .select()
    .single();

  if (workerErr)
    return NextResponse.json({ error: workerErr.message }, { status: 500 });

  if (skills && skills.length > 0) {
    const skillRows = skills.map((skill) => ({
      worker_id: worker.id,
      skill,
      name: skill,
    }));
    const { error: skillErr } = await supabase.from("stg_worker_skills").insert(skillRows);
    if (skillErr) return NextResponse.json({ error: skillErr.message }, { status: 500 });
  }

  if (defaultSchedule && defaultSchedule.length > 0) {
    const scheduleRows = defaultSchedule.map((row) => ({
      worker_id: worker.id,
      day_of_week: row.day_of_week,
      is_working: row.is_working,
      start_time: row.is_working ? (row.start_time ?? null) : null,
      end_time: row.is_working ? (row.end_time ?? null) : null,
    }));
    const { error: schedErr } = await supabase
      .from("worker_default_schedule")
      .insert(scheduleRows);
    if (schedErr) return NextResponse.json({ error: schedErr.message }, { status: 500 });
  }

  return NextResponse.json({ worker }, { status: 201 });
}
