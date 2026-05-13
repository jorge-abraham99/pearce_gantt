"use client";

import Link from "next/link";
import { useState, useTransition } from "react";

import ExceptionFormModal from "@/components/admin/ExceptionFormModal";
import WorkerFormModal from "@/components/admin/WorkerFormModal";
import type {
  WorkerAvailabilityException,
  WorkerDetail,
  WorkerListItem,
} from "@/types/planner";

type ExceptionModalState =
  | null
  | { mode: "create" }
  | { mode: "edit"; exception: WorkerAvailabilityException };

type WorkerProfileShellProps = {
  initialDetail: WorkerDetail;
};

const DAY_NAMES: Record<number, string> = {
  1: "Monday",
  2: "Tuesday",
  3: "Wednesday",
  4: "Thursday",
  5: "Friday",
  6: "Saturday",
  7: "Sunday",
};

const EXCEPTION_STYLES: Record<string, { bg: string; text: string; label: string }> = {
  holiday: { bg: "bg-amber-50 border-amber-200", text: "text-amber-700", label: "Holiday" },
  overtime: { bg: "bg-green-50 border-green-200", text: "text-green-700", label: "Overtime" },
  custom_shift: { bg: "bg-blue-50 border-blue-200", text: "text-blue-700", label: "Custom shift" },
  unavailable: { bg: "bg-red-50 border-red-200", text: "text-red-700", label: "Unavailable" },
};

export default function WorkerProfileShell({ initialDetail }: WorkerProfileShellProps) {
  const [detail, setDetail] = useState<WorkerDetail>(initialDetail);
  const [editWorker, setEditWorker] = useState(false);
  const [exceptionModal, setExceptionModal] = useState<ExceptionModalState>(null);
  const [, startTransition] = useTransition();

  async function refreshDetail() {
    const res = await fetch(`/api/admin/workers/${detail.worker.id}`, {
      cache: "no-store",
    });
    if (res.ok) {
      const json = (await res.json()) as WorkerDetail;
      setDetail(json);
    }
  }

  function handleWorkerSaved() {
    setEditWorker(false);
    startTransition(async () => { await refreshDetail(); });
  }

  function handleExceptionSaved() {
    setExceptionModal(null);
    startTransition(async () => { await refreshDetail(); });
  }

  async function handleDeleteException(exception: WorkerAvailabilityException) {
    if (!confirm("Remove this exception?")) return;
    const res = await fetch(
      `/api/admin/workers/${detail.worker.id}/exceptions/${exception.id}`,
      { method: "DELETE" },
    );
    if (res.ok) await refreshDetail();
  }

  const { worker, skills, defaultSchedule, exceptions } = detail;

  const sortedExceptions = [...exceptions].sort(
    (a, b) => new Date(a.start_at).getTime() - new Date(b.start_at).getTime(),
  );

  // Build a WorkerListItem to pass to WorkerFormModal
  const asListItem: WorkerListItem = { worker, skills, defaultSchedule, exceptions };

  return (
    <>
      <div className="flex h-[calc(100vh-5rem)] min-h-[640px] flex-col overflow-hidden rounded-3xl border border-[var(--line)] bg-[var(--panel)] shadow-panel">
        {/* Toolbar */}
        <div className="flex flex-wrap items-center gap-3 border-b border-[var(--line)] bg-[var(--panel)] px-5 py-4 md:gap-4 md:px-6">
          <div className="flex flex-col">
            <p className="text-[10px] font-bold uppercase tracking-[0.24em] text-[var(--accent)]">
              Pearce Planner
            </p>
            <h1 className="font-display text-xl font-semibold leading-tight text-[var(--ink)] md:text-2xl">
              {worker.name}
            </h1>
          </div>
          <div className="ml-auto flex gap-3">
            <button
              type="button"
              onClick={() => setEditWorker(true)}
              className="rounded-full border border-[var(--line)] px-4 py-2 text-sm font-semibold text-[var(--muted)] transition hover:border-[var(--ink)] hover:text-[var(--ink)]"
            >
              Edit worker
            </button>
            <Link
              href="/admin/workers"
              className="rounded-full border border-[var(--line)] px-4 py-2 text-sm font-semibold text-[var(--muted)] transition hover:border-[var(--ink)] hover:text-[var(--ink)]"
            >
              ← All workers
            </Link>
          </div>
        </div>

        {/* Content */}
        <div className="flex min-h-0 flex-1 flex-col gap-0 overflow-auto">
          <div className="grid gap-5 p-6 md:grid-cols-[1fr_1fr]">
            {/* Worker info */}
            <section className="rounded-2xl border border-[var(--line)] bg-white p-5">
              <h2 className="mb-3 text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--muted)]">
                Worker details
              </h2>
              <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
                <Field label="Name" value={worker.name} />
                <Field label="Hours / day" value={`${worker.hours_per_day}h`} />
                {worker.hours_per_week ? (
                  <Field label="Hours / week" value={`${worker.hours_per_week}h`} />
                ) : null}
                <div className="col-span-2">
                  <dt className="text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--muted)]">
                    Skills
                  </dt>
                  <dd className="mt-1 flex flex-wrap gap-1.5">
                    {skills.length === 0 ? (
                      <span className="text-[var(--muted)]">None</span>
                    ) : (
                      skills.map((s) => (
                        <span
                          key={String(s.id)}
                          className="rounded-full bg-[var(--ink)] px-2.5 py-0.5 text-xs font-semibold text-white"
                        >
                          {s.skill}
                        </span>
                      ))
                    )}
                  </dd>
                </div>
              </dl>
            </section>

            {/* Weekly schedule */}
            <section className="rounded-2xl border border-[var(--line)] bg-white p-5">
              <h2 className="mb-3 text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--muted)]">
                Default weekly schedule
              </h2>
              {defaultSchedule.length === 0 ? (
                <p className="text-sm text-[var(--muted)]">No schedule set.</p>
              ) : (
                <div className="grid gap-2">
                  {Array.from({ length: 7 }, (_, i) => {
                    const day = i + 1;
                    const row = defaultSchedule.find((s) => s.day_of_week === day);
                    return (
                      <div key={day} className="flex items-center gap-3 text-sm">
                        <span className="w-24 font-semibold text-[var(--ink)]">
                          {DAY_NAMES[day]}
                        </span>
                        {row?.is_working ? (
                          <span className="text-[var(--ink)]">
                            {row.start_time} – {row.end_time}
                          </span>
                        ) : (
                          <span className="text-[var(--muted)]">Off</span>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </section>
          </div>

          {/* Exceptions section */}
          <section className="border-t border-[var(--line)] px-6 py-5">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--muted)]">
                Availability exceptions ({exceptions.length})
              </h2>
              <button
                type="button"
                onClick={() => setExceptionModal({ mode: "create" })}
                className="rounded-full bg-[var(--accent)] px-3 py-1.5 text-xs font-bold uppercase tracking-[0.14em] text-white transition hover:bg-[var(--ink)]"
              >
                + Add exception
              </button>
            </div>

            {sortedExceptions.length === 0 ? (
              <p className="text-sm text-[var(--muted)]">
                No exceptions yet. Add holidays, overtime, or other overrides.
              </p>
            ) : (
              <div className="grid gap-2">
                {sortedExceptions.map((ex) => {
                  const style = EXCEPTION_STYLES[ex.exception_type] ?? {
                    bg: "bg-[var(--panel-2)] border-[var(--line)]",
                    text: "text-[var(--ink)]",
                    label: ex.exception_type,
                  };
                  return (
                    <div
                      key={String(ex.id)}
                      className={`flex items-center justify-between gap-3 rounded-xl border px-4 py-2.5 ${style.bg}`}
                    >
                      <div className="flex flex-col gap-0.5">
                        <div className="flex items-center gap-2">
                          <span
                            className={`text-[10px] font-bold uppercase tracking-[0.14em] ${style.text}`}
                          >
                            {style.label}
                          </span>
                          {ex.title && (
                            <span className="text-sm font-semibold text-[var(--ink)]">
                              {ex.title}
                            </span>
                          )}
                        </div>
                        <span className="text-xs text-[var(--muted)]">
                          {ex.all_day
                            ? `${fmtDate(ex.start_at)} – ${fmtDate(ex.end_at)}`
                            : `${fmtDatetime(ex.start_at)} – ${fmtDatetime(ex.end_at)}`}
                        </span>
                        {ex.notes && (
                          <span className="text-xs text-[var(--muted)]">{ex.notes}</span>
                        )}
                      </div>
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => setExceptionModal({ mode: "edit", exception: ex })}
                          className="rounded-full border border-[var(--line)] bg-white px-3 py-1 text-xs font-semibold uppercase tracking-[0.12em] text-[var(--muted)] transition hover:border-[var(--ink)] hover:text-[var(--ink)]"
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteException(ex)}
                          className="rounded-full border border-red-200 bg-white px-3 py-1 text-xs font-semibold uppercase tracking-[0.12em] text-red-500 transition hover:border-red-500 hover:text-red-700"
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        </div>
      </div>

      {editWorker && (
        <WorkerFormModal
          mode="edit"
          initialData={asListItem}
          onSave={handleWorkerSaved}
          onClose={() => setEditWorker(false)}
        />
      )}

      {exceptionModal !== null && (
        <ExceptionFormModal
          mode={exceptionModal.mode}
          workerId={worker.id}
          workerName={worker.name}
          initialData={
            exceptionModal.mode === "edit" ? exceptionModal.exception : undefined
          }
          onSave={handleExceptionSaved}
          onClose={() => setExceptionModal(null)}
        />
      )}
    </>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col">
      <dt className="text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--muted)]">
        {label}
      </dt>
      <dd className="font-semibold text-[var(--ink)]">{value}</dd>
    </div>
  );
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function fmtDatetime(iso: string): string {
  return new Date(iso).toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}
