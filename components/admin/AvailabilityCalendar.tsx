"use client";

import { useMemo, useState, useTransition } from "react";

import type {
  Id,
  WorkerAvailabilityException,
  WorkerListItem,
} from "@/types/planner";

const CELL_W = 52;
const ROW_H = 48;
const WORKER_COL_W = 192;
const DAYS_SHOWN = 28;

const EXCEPTION_COLORS: Record<string, { bg: string; text: string; label: string }> = {
  holiday: { bg: "bg-amber-100 border-amber-300", text: "text-amber-800", label: "Holiday" },
  sickness: { bg: "bg-rose-100 border-rose-300", text: "text-rose-800", label: "Sick" },
  other_absence: { bg: "bg-stone-100 border-stone-300", text: "text-stone-800", label: "Other" },
  overtime: { bg: "bg-green-100 border-green-300", text: "text-green-800", label: "Overtime" },
  custom_shift: { bg: "bg-blue-100 border-blue-300", text: "text-blue-800", label: "Custom" },
  unavailable: { bg: "bg-red-100 border-red-300", text: "text-red-800", label: "Unavailable" },
};

type AvailabilityCalendarProps = {
  workers: WorkerListItem[];
  onAddException: (workerId: Id, workerName: string, date: Date) => void;
  onEditException: (exception: WorkerAvailabilityException, workerName: string) => void;
  onDeleteException: () => void;
};

export default function AvailabilityCalendar({
  workers,
  onAddException,
  onEditException,
  onDeleteException,
}: AvailabilityCalendarProps) {
  const [startOffset, setStartOffset] = useState(0); // weeks offset from current week start
  const [, startTransition] = useTransition();

  const dates = useMemo(() => {
    const weekStart = getWeekStart(new Date());
    weekStart.setDate(weekStart.getDate() + startOffset * 7);
    return Array.from({ length: DAYS_SHOWN }, (_, i) => {
      const d = new Date(weekStart);
      d.setDate(d.getDate() + i);
      return d;
    });
  }, [startOffset]);

  const rangeLabel = useMemo(() => {
    const first = dates[0];
    const last = dates[dates.length - 1];
    return `${fmtShort(first)} – ${fmtShort(last)}`;
  }, [dates]);

  const today = useMemo(() => {
    const t = new Date();
    t.setHours(0, 0, 0, 0);
    return t;
  }, []);

  async function handleDeleteException(exception: WorkerAvailabilityException) {
    if (!confirm("Remove this exception?")) return;
    const res = await fetch(
      `/api/admin/workers/${exception.worker_id}/exceptions/${exception.id}`,
      { method: "DELETE" },
    );
    if (res.ok) onDeleteException();
  }

  if (workers.length === 0) {
    return (
      <div className="flex h-full items-center justify-center p-10 text-[var(--muted)]">
        No workers to display.
      </div>
    );
  }

  const totalW = WORKER_COL_W + DAYS_SHOWN * CELL_W;

  return (
    <div className="flex flex-col">
      {/* Calendar toolbar */}
      <div className="flex items-center gap-3 border-b border-[var(--line)] bg-[var(--panel-2)] px-5 py-2.5">
        <button
          type="button"
          onClick={() => setStartOffset((n) => n - 1)}
          className="rounded-full border border-[var(--line)] px-3 py-1 text-xs font-semibold text-[var(--muted)] transition hover:border-[var(--ink)] hover:text-[var(--ink)]"
        >
          ← Prev
        </button>
        <span className="text-sm font-semibold text-[var(--ink)]">{rangeLabel}</span>
        <button
          type="button"
          onClick={() => setStartOffset((n) => n + 1)}
          className="rounded-full border border-[var(--line)] px-3 py-1 text-xs font-semibold text-[var(--muted)] transition hover:border-[var(--ink)] hover:text-[var(--ink)]"
        >
          Next →
        </button>
        {startOffset !== 0 && (
          <button
            type="button"
            onClick={() => setStartOffset(0)}
            className="ml-auto rounded-full border border-[var(--line)] px-3 py-1 text-xs font-semibold uppercase tracking-[0.12em] text-[var(--muted)] transition hover:border-[var(--ink)] hover:text-[var(--ink)]"
          >
            Today
          </button>
        )}
        <div className="ml-auto flex flex-wrap gap-3">
          {Object.entries(EXCEPTION_COLORS).map(([type, c]) => (
            <span key={type} className="flex items-center gap-1 text-xs text-[var(--muted)]">
              <span className={`inline-block h-3 w-3 rounded-sm border ${c.bg}`} />
              {c.label}
            </span>
          ))}
        </div>
      </div>

      {/* Grid */}
      <div className="overflow-auto">
        <div style={{ minWidth: totalW }}>
          {/* Header row */}
          <div className="flex border-b border-[var(--line)] bg-[var(--panel-2)]">
            <div
              style={{ width: WORKER_COL_W, minWidth: WORKER_COL_W }}
              className="sticky left-0 z-10 border-r border-[var(--line)] bg-[var(--panel-2)] px-4 py-2 text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--muted)]"
            >
              Worker
            </div>
            {dates.map((date) => {
              const isToday = date.getTime() === today.getTime();
              return (
                <div
                  key={date.toISOString()}
                  style={{ width: CELL_W, minWidth: CELL_W }}
                  className={`flex flex-col items-center justify-center border-r border-[var(--line-faint)] py-1.5 text-center ${
                    isToday ? "bg-[var(--today-band)]" : ""
                  }`}
                >
                  <span
                    className={`text-[10px] font-bold uppercase tracking-[0.12em] ${
                      isToday ? "text-[var(--accent)]" : "text-[var(--muted)]"
                    }`}
                  >
                    {fmtDay(date)}
                  </span>
                  <span
                    className={`text-sm font-semibold ${
                      isToday ? "text-[var(--accent)]" : "text-[var(--ink)]"
                    }`}
                  >
                    {date.getDate()}
                  </span>
                </div>
              );
            })}
          </div>

          {/* Worker rows */}
          {workers.map(({ worker, defaultSchedule, exceptions }) => (
            <div
              key={String(worker.id)}
              className="flex border-b border-[var(--line-faint)]"
              style={{ height: ROW_H }}
            >
              {/* Worker name cell */}
              <div
                style={{ width: WORKER_COL_W, minWidth: WORKER_COL_W }}
                className="sticky left-0 z-10 flex items-center border-r border-[var(--line)] bg-[var(--panel)] px-4 py-2"
              >
                <span className="truncate text-sm font-semibold text-[var(--ink)]">
                  {worker.name}
                </span>
              </div>

              {/* Day cells */}
              {dates.map((date) => {
                const dayOfWeek = getISOWeekday(date);
                const defaultDay = defaultSchedule.find((s) => s.day_of_week === dayOfWeek);
                const isDefaultWorking = defaultDay?.is_working ?? true;
                const isToday = date.getTime() === today.getTime();

                const dayExceptions = exceptions.filter((e) =>
                  exceptionCoversDate(e, date),
                );

                const topException = dayExceptions[0];
                const extraCount = dayExceptions.length - 1;

                const cellBg = topException
                  ? EXCEPTION_COLORS[topException.exception_type]?.bg ?? ""
                  : !isDefaultWorking
                    ? "bg-[var(--weekend)]"
                    : isToday
                      ? "bg-[var(--today-band)]"
                      : "";

                return (
                  <div
                    key={date.toISOString()}
                    style={{ width: CELL_W, minWidth: CELL_W }}
                    className={`relative flex cursor-pointer items-center justify-center border-r border-[var(--line-faint)] p-0.5 transition hover:brightness-95 ${cellBg}`}
                    title={
                      !isDefaultWorking
                        ? "Non-working day"
                        : topException
                          ? `${topException.exception_type}${topException.title ? `: ${topException.title}` : ""}`
                          : "Working"
                    }
                    onClick={() => {
                      if (topException) {
                        onEditException(topException, worker.name);
                      } else {
                        onAddException(worker.id, worker.name, date);
                      }
                    }}
                  >
                    {topException ? (
                      <div className="flex w-full flex-col items-center gap-0.5">
                        <span
                          className={`max-w-full truncate text-center text-[9px] font-bold uppercase leading-none ${
                            EXCEPTION_COLORS[topException.exception_type]?.text ?? ""
                          }`}
                        >
                          {EXCEPTION_COLORS[topException.exception_type]?.label ?? topException.exception_type}
                        </span>
                        {extraCount > 0 && (
                          <span className="text-[9px] text-[var(--muted)]">+{extraCount}</span>
                        )}
                        <button
                          type="button"
                          className="absolute right-0.5 top-0.5 rounded-full p-0.5 text-[var(--muted)] opacity-0 transition hover:text-red-600 group-hover:opacity-100"
                          title="Remove exception"
                          onClick={(e) => {
                            e.stopPropagation();
                            startTransition(async () => {
                              await handleDeleteException(topException);
                            });
                          }}
                        >
                          ×
                        </button>
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function getWeekStart(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  const day = d.getDay(); // 0=Sun
  const diff = day === 0 ? -6 : 1 - day; // Mon = start
  d.setDate(d.getDate() + diff);
  return d;
}

function getISOWeekday(date: Date): number {
  const day = date.getDay(); // 0=Sun
  return day === 0 ? 7 : day;
}

function exceptionCoversDate(
  exception: WorkerAvailabilityException,
  date: Date,
): boolean {
  const dayStart = new Date(date);
  dayStart.setHours(0, 0, 0, 0);
  const dayEnd = new Date(date);
  dayEnd.setHours(23, 59, 59, 999);
  const exStart = new Date(exception.start_at);
  const exEnd = new Date(exception.end_at);
  return exStart <= dayEnd && exEnd >= dayStart;
}

const DAY_SHORT = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function fmtDay(date: Date): string {
  return DAY_SHORT[getISOWeekday(date) - 1];
}

function fmtShort(date: Date): string {
  return date.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}
