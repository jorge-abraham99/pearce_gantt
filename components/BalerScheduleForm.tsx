"use client";

import { useState, useTransition } from "react";

import WorkerGantt from "@/components/WorkerGantt";
import type { BalerType, GanttAssignment, ScheduleOrderResponse } from "@/types/planner";

type BalerScheduleFormProps = {
  initialBalerTypes: BalerType[];
  initialAssignments: GanttAssignment[];
};

function todayDateValue() {
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export default function BalerScheduleForm({
  initialBalerTypes,
  initialAssignments,
}: BalerScheduleFormProps) {
  const [startDate, setStartDate] = useState(todayDateValue);
  const [balerTypeId, setBalerTypeId] = useState<string>(
    initialBalerTypes[0] ? String(initialBalerTypes[0].id) : "",
  );
  const [assignments, setAssignments] = useState(initialAssignments);
  const [lastSchedule, setLastSchedule] = useState<ScheduleOrderResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function scheduleOrder() {
    setError(null);

    startTransition(async () => {
      try {
        const scheduleRes = await fetch("/api/schedule-order", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ balerTypeId, startDate }),
        });

        const scheduleJson = await scheduleRes.json();
        if (!scheduleRes.ok) {
          throw new Error(scheduleJson.error ?? "Failed to schedule order");
        }

        const ganttRes = await fetch("/api/gantt", { cache: "no-store" });
        const ganttJson = await ganttRes.json();
        if (!ganttRes.ok) {
          throw new Error(ganttJson.error ?? "Failed to refresh gantt");
        }

        setLastSchedule(scheduleJson);
        setAssignments(ganttJson.assignments ?? []);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Scheduling failed");
      }
    });
  }

  return (
    <div className="grid gap-8 lg:grid-cols-[24rem_1fr]">
      <section className="h-fit rounded-[1.75rem] border border-[var(--line)] bg-white/75 p-6 shadow-panel backdrop-blur">
        <h2 className="font-display text-3xl font-semibold">Create schedule</h2>
        <p className="mt-2 text-sm leading-6 text-[var(--muted)]">
          Creates one order, assigns each required stage, and refreshes the Gantt.
        </p>

        <div className="mt-6 grid gap-5">
          <label className="grid gap-2 text-sm font-semibold">
            Start date
            <input
              className="rounded-2xl border border-[var(--line)] bg-white px-4 py-3 outline-none transition focus:border-[var(--accent)]"
              type="date"
              value={startDate}
              onChange={(event) => setStartDate(event.target.value)}
            />
          </label>

          <label className="grid gap-2 text-sm font-semibold">
            Baler type
            <select
              className="rounded-2xl border border-[var(--line)] bg-white px-4 py-3 outline-none transition focus:border-[var(--accent)]"
              value={balerTypeId}
              onChange={(event) => setBalerTypeId(event.target.value)}
              disabled={initialBalerTypes.length === 0}
            >
              {initialBalerTypes.length === 0 ? (
                <option value="">No baler types found</option>
              ) : null}
              {initialBalerTypes.map((balerType) => (
                <option key={String(balerType.id)} value={String(balerType.id)}>
                  {balerType.name}
                </option>
              ))}
            </select>
          </label>

          <button
            className="rounded-2xl bg-[var(--ink)] px-5 py-4 text-sm font-bold uppercase tracking-[0.18em] text-white transition hover:-translate-y-0.5 hover:bg-[var(--accent)] disabled:cursor-not-allowed disabled:opacity-50"
            type="button"
            disabled={isPending || !balerTypeId || !startDate}
            onClick={scheduleOrder}
          >
            {isPending ? "Scheduling..." : "Schedule"}
          </button>
        </div>

        {error ? (
          <p className="mt-5 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-900">
            {error}
          </p>
        ) : null}

        {lastSchedule ? (
          <div className="mt-6 rounded-3xl bg-[#14212b] p-5 text-white">
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#f2c8b8]">
              Scheduled Order
            </p>
            <h3 className="mt-2 font-display text-3xl font-semibold">
              {lastSchedule.orderNumber} / {lastSchedule.balerName}
            </h3>
            <dl className="mt-4 grid gap-2 text-sm text-white/82">
              <div className="flex justify-between gap-4">
                <dt>Start</dt>
                <dd>{formatDateTime(lastSchedule.scheduledStart)}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt>Finish</dt>
                <dd>{formatDateTime(lastSchedule.scheduledEnd)}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt>Total hours</dt>
                <dd>{lastSchedule.totalScheduledHours}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt>Bars created</dt>
                <dd>{lastSchedule.assignmentsCreated}</dd>
              </div>
            </dl>
          </div>
        ) : null}
      </section>

      <WorkerGantt assignments={assignments} />
    </div>
  );
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}
