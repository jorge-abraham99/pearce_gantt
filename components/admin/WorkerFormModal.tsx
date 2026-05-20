"use client";

import { useState, useTransition } from "react";

import type { WorkerDefaultSchedule, WorkerListItem } from "@/types/planner";

const KNOWN_SKILLS = ["pressing", "welding", "spraying", "assembling"];

const DAY_NAMES: Record<number, string> = {
  1: "Monday",
  2: "Tuesday",
  3: "Wednesday",
  4: "Thursday",
  5: "Friday",
  6: "Saturday",
  7: "Sunday",
};

type ScheduleRow = {
  day_of_week: number;
  is_working: boolean;
  start_time: string | null;
  end_time: string | null;
};

const DEFAULT_SCHEDULE: ScheduleRow[] = [
  { day_of_week: 1, is_working: true, start_time: "08:00", end_time: "16:00" },
  { day_of_week: 2, is_working: true, start_time: "08:00", end_time: "16:00" },
  { day_of_week: 3, is_working: true, start_time: "08:00", end_time: "16:00" },
  { day_of_week: 4, is_working: true, start_time: "08:00", end_time: "16:00" },
  { day_of_week: 5, is_working: true, start_time: "08:00", end_time: "16:00" },
  { day_of_week: 6, is_working: false, start_time: null, end_time: null },
  { day_of_week: 7, is_working: false, start_time: null, end_time: null },
];

function buildScheduleFromData(data: WorkerDefaultSchedule[]): ScheduleRow[] {
  return Array.from({ length: 7 }, (_, i) => {
    const day = i + 1;
    const row = data.find((d) => d.day_of_week === day);
    return row
      ? {
          day_of_week: day,
          is_working: row.is_working,
          start_time: row.start_time ?? null,
          end_time: row.end_time ?? null,
        }
      : { day_of_week: day, is_working: day <= 5, start_time: "08:00", end_time: "16:00" };
  });
}

type WorkerFormModalProps = {
  mode: "create" | "edit";
  initialData?: WorkerListItem;
  onSave: () => void;
  onClose: () => void;
};

export default function WorkerFormModal({
  mode,
  initialData,
  onSave,
  onClose,
}: WorkerFormModalProps) {
  const [name, setName] = useState(initialData?.worker.name ?? "");
  const [hoursPerDay, setHoursPerDay] = useState(
    String(initialData?.worker.hours_per_day ?? 8),
  );
  const [selectedSkills, setSelectedSkills] = useState<Set<string>>(
    new Set(initialData?.skills.map((s) => s.skill) ?? []),
  );
  const [customSkill, setCustomSkill] = useState("");
  const [schedule, setSchedule] = useState<ScheduleRow[]>(
    initialData?.defaultSchedule && initialData.defaultSchedule.length > 0
      ? buildScheduleFromData(initialData.defaultSchedule)
      : DEFAULT_SCHEDULE,
  );
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function toggleSkill(skill: string) {
    setSelectedSkills((prev) => {
      const next = new Set(prev);
      if (next.has(skill)) next.delete(skill);
      else next.add(skill);
      return next;
    });
  }

  function addCustomSkill() {
    const s = customSkill.trim().toLowerCase();
    if (!s) return;
    setSelectedSkills((prev) => new Set([...prev, s]));
    setCustomSkill("");
  }

  function toggleDay(idx: number) {
    setSchedule((prev) =>
      prev.map((row, i) =>
        i === idx
          ? {
              ...row,
              is_working: !row.is_working,
              start_time: !row.is_working ? "08:00" : null,
              end_time: !row.is_working ? "16:00" : null,
            }
          : row,
      ),
    );
  }

  function updateTime(idx: number, field: "start_time" | "end_time", value: string) {
    setSchedule((prev) =>
      prev.map((row, i) => (i === idx ? { ...row, [field]: value || null } : row)),
    );
  }

  function handleSubmit() {
    setError(null);
    const trimmedName = name.trim();
    if (!trimmedName) {
      setError("Name is required.");
      return;
    }
    const hours = Number(hoursPerDay);
    if (!hours || hours <= 0 || hours > 24) {
      setError("Hours per day must be between 1 and 24.");
      return;
    }

    startTransition(async () => {
      try {
        const skillsArr = Array.from(selectedSkills);

        if (mode === "create") {
          const res = await fetch("/api/admin/workers", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              name: trimmedName,
              hours_per_day: hours,
              skills: skillsArr,
              defaultSchedule: schedule,
            }),
          });
          const json = await res.json();
          if (!res.ok) throw new Error((json as { error?: string }).error ?? "Failed to create worker");
        } else {
          const id = initialData!.worker.id;

          const [wRes, sRes, scRes] = await Promise.all([
            fetch(`/api/admin/workers/${id}`, {
              method: "PUT",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ name: trimmedName, hours_per_day: hours }),
            }),
            fetch(`/api/admin/workers/${id}/skills`, {
              method: "PUT",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ skills: skillsArr }),
            }),
            fetch(`/api/admin/workers/${id}/schedule`, {
              method: "PUT",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ schedule, hours_per_day: hours }),
            }),
          ]);

          for (const r of [wRes, sRes, scRes]) {
            if (!r.ok) {
              const j = await r.json();
              throw new Error((j as { error?: string }).error ?? "Failed to update worker");
            }
          }
        }

        onSave();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Something went wrong");
      }
    });
  }

  const allSkills = [...KNOWN_SKILLS, ...Array.from(selectedSkills).filter((s) => !KNOWN_SKILLS.includes(s))];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--ink)]/40 p-4">
      <div className="flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-3xl bg-[var(--panel)] shadow-panel">
        {/* Header */}
        <div className="flex items-center justify-between gap-4 border-b border-[var(--line)] px-6 py-4">
          <h2 className="font-display text-xl font-semibold text-[var(--ink)]">
            {mode === "create" ? "Add worker" : `Edit ${initialData?.worker.name ?? "worker"}`}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full border border-[var(--line)] px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] text-[var(--muted)] transition hover:border-[var(--ink)] hover:text-[var(--ink)]"
          >
            Cancel
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-5">
          <div className="grid gap-6">
            {/* Basic info */}
            <section className="grid gap-4 md:grid-cols-2">
              <label className="grid gap-1 text-sm font-semibold text-[var(--ink)]">
                Name
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. John Smith"
                  className="rounded-xl border border-[var(--line)] bg-white px-3 py-2 font-normal outline-none transition focus:border-[var(--accent)]"
                />
              </label>
              <label className="grid gap-1 text-sm font-semibold text-[var(--ink)]">
                Hours per day
                <input
                  type="number"
                  min="1"
                  max="24"
                  step="0.5"
                  value={hoursPerDay}
                  onChange={(e) => setHoursPerDay(e.target.value)}
                  className="rounded-xl border border-[var(--line)] bg-white px-3 py-2 font-normal outline-none transition focus:border-[var(--accent)]"
                />
              </label>
            </section>

            {/* Skills */}
            <section>
              <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--muted)]">
                Skills / trades
              </p>
              <div className="flex flex-wrap gap-2">
                {allSkills.map((skill) => (
                  <button
                    key={skill}
                    type="button"
                    onClick={() => toggleSkill(skill)}
                    className={`rounded-full px-3 py-1 text-xs font-bold uppercase tracking-[0.12em] transition ${
                      selectedSkills.has(skill)
                        ? "bg-[var(--ink)] text-white"
                        : "border border-[var(--line)] text-[var(--muted)] hover:border-[var(--ink)] hover:text-[var(--ink)]"
                    }`}
                  >
                    {skill}
                  </button>
                ))}
              </div>
              <div className="mt-2 flex gap-2">
                <input
                  type="text"
                  value={customSkill}
                  onChange={(e) => setCustomSkill(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addCustomSkill(); } }}
                  placeholder="Add custom skill…"
                  className="flex-1 rounded-xl border border-[var(--line)] bg-white px-3 py-1.5 text-sm outline-none transition focus:border-[var(--accent)]"
                />
                <button
                  type="button"
                  onClick={addCustomSkill}
                  className="rounded-xl border border-[var(--line)] px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.14em] text-[var(--muted)] transition hover:border-[var(--ink)] hover:text-[var(--ink)]"
                >
                  Add
                </button>
              </div>
            </section>

            {/* Weekly schedule */}
            <section>
              <p className="mb-3 text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--muted)]">
                Default weekly schedule
              </p>
              <div className="grid gap-2">
                {schedule.map((row, idx) => (
                  <div key={row.day_of_week} className="flex items-center gap-3">
                    <span className="w-24 text-sm font-semibold text-[var(--ink)]">
                      {DAY_NAMES[row.day_of_week]}
                    </span>
                    <button
                      type="button"
                      onClick={() => toggleDay(idx)}
                      className={`w-20 rounded-full py-1 text-xs font-bold uppercase tracking-[0.12em] transition ${
                        row.is_working
                          ? "bg-[var(--ink)] text-white"
                          : "border border-[var(--line)] text-[var(--muted)] hover:border-[var(--ink)]"
                      }`}
                    >
                      {row.is_working ? "Working" : "Off"}
                    </button>
                    {row.is_working && (
                      <>
                        <input
                          type="time"
                          value={row.start_time ?? ""}
                          onChange={(e) => updateTime(idx, "start_time", e.target.value)}
                          className="rounded-xl border border-[var(--line)] bg-white px-2 py-1 text-sm outline-none focus:border-[var(--accent)]"
                        />
                        <span className="text-[var(--muted)]">–</span>
                        <input
                          type="time"
                          value={row.end_time ?? ""}
                          onChange={(e) => updateTime(idx, "end_time", e.target.value)}
                          className="rounded-xl border border-[var(--line)] bg-white px-2 py-1 text-sm outline-none focus:border-[var(--accent)]"
                        />
                      </>
                    )}
                  </div>
                ))}
              </div>
            </section>

            {error && (
              <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-900">
                {error}
              </p>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-3 border-t border-[var(--line)] bg-[var(--panel-2)] px-6 py-4">
          <button
            type="button"
            onClick={onClose}
            className="rounded-full border border-[var(--line)] px-4 py-2 text-sm font-semibold text-[var(--muted)] transition hover:border-[var(--ink)] hover:text-[var(--ink)]"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={isPending}
            className="rounded-full bg-[var(--accent)] px-5 py-2 text-sm font-bold uppercase tracking-[0.14em] text-white transition hover:bg-[var(--ink)] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isPending ? "Saving…" : mode === "create" ? "Add worker" : "Save changes"}
          </button>
        </div>
      </div>
    </div>
  );
}
