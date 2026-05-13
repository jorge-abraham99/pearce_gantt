"use client";

import { useState, useTransition } from "react";

import type { ExceptionType, Id, WorkerAvailabilityException } from "@/types/planner";

const EXCEPTION_TYPES: { value: ExceptionType; label: string }[] = [
  { value: "holiday", label: "Holiday" },
  { value: "overtime", label: "Overtime" },
  { value: "custom_shift", label: "Custom shift" },
  { value: "unavailable", label: "Unavailable" },
];

type ExceptionFormModalProps = {
  mode: "create" | "edit";
  workerId: Id;
  workerName: string;
  initialDate?: string;      // "YYYY-MM-DD", used in create mode
  initialData?: WorkerAvailabilityException;
  onSave: () => void;
  onClose: () => void;
};

export default function ExceptionFormModal({
  mode,
  workerId,
  workerName,
  initialDate,
  initialData,
  onSave,
  onClose,
}: ExceptionFormModalProps) {
  const defaultAllDay = initialData ? initialData.all_day : true;
  const defaultType: ExceptionType = initialData ? (initialData.exception_type as ExceptionType) : "holiday";

  const defaultStartDate = initialData
    ? initialData.start_at.substring(0, 10)
    : (initialDate ?? todayStr());
  const defaultEndDate = initialData
    ? initialData.end_at.substring(0, 10)
    : (initialDate ?? todayStr());
  const defaultStartDatetime = initialData
    ? initialData.start_at.substring(0, 16)
    : initialDate
      ? `${initialDate}T08:00`
      : `${todayStr()}T08:00`;
  const defaultEndDatetime = initialData
    ? initialData.end_at.substring(0, 16)
    : initialDate
      ? `${initialDate}T17:00`
      : `${todayStr()}T17:00`;

  const [allDay, setAllDay] = useState(defaultAllDay);
  const [exceptionType, setExceptionType] = useState<ExceptionType>(defaultType);
  const [startDate, setStartDate] = useState(defaultStartDate);
  const [endDate, setEndDate] = useState(defaultEndDate);
  const [startDatetime, setStartDatetime] = useState(defaultStartDatetime);
  const [endDatetime, setEndDatetime] = useState(defaultEndDatetime);
  const [title, setTitle] = useState(initialData?.title ?? "");
  const [notes, setNotes] = useState(initialData?.notes ?? "");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSubmit() {
    setError(null);

    let start_at: string;
    let end_at: string;

    if (allDay) {
      if (!startDate || !endDate) {
        setError("Start and end dates are required.");
        return;
      }
      start_at = `${startDate}T00:00:00`;
      end_at = `${endDate}T23:59:59`;
    } else {
      if (!startDatetime || !endDatetime) {
        setError("Start and end times are required.");
        return;
      }
      start_at = `${startDatetime}:00`;
      end_at = `${endDatetime}:00`;
    }

    if (start_at >= end_at) {
      setError("End must be after start.");
      return;
    }

    startTransition(async () => {
      try {
        const body = {
          exception_type: exceptionType,
          start_at,
          end_at,
          all_day: allDay,
          title: title.trim() || null,
          notes: notes.trim() || null,
        };

        let res: Response;
        if (mode === "create") {
          res = await fetch(`/api/admin/workers/${workerId}/exceptions`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
          });
        } else {
          res = await fetch(
            `/api/admin/workers/${workerId}/exceptions/${initialData!.id}`,
            {
              method: "PUT",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(body),
            },
          );
        }

        const json = await res.json();
        if (!res.ok) throw new Error((json as { error?: string }).error ?? "Failed to save");
        onSave();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Something went wrong");
      }
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--ink)]/40 p-4">
      <div className="flex max-h-[90vh] w-full max-w-lg flex-col overflow-hidden rounded-3xl bg-[var(--panel)] shadow-panel">
        {/* Header */}
        <div className="flex items-center justify-between gap-4 border-b border-[var(--line)] px-6 py-4">
          <div>
            <h2 className="font-display text-xl font-semibold text-[var(--ink)]">
              {mode === "create" ? "Add exception" : "Edit exception"}
            </h2>
            <p className="text-sm text-[var(--muted)]">{workerName}</p>
          </div>
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
          <div className="grid gap-4">
            {/* Type */}
            <label className="grid gap-1 text-sm font-semibold text-[var(--ink)]">
              Type
              <select
                value={exceptionType}
                onChange={(e) => setExceptionType(e.target.value as ExceptionType)}
                className="rounded-xl border border-[var(--line)] bg-white px-3 py-2 font-normal outline-none transition focus:border-[var(--accent)]"
              >
                {EXCEPTION_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </select>
            </label>

            {/* All day toggle */}
            <label className="flex items-center gap-3 text-sm font-semibold text-[var(--ink)]">
              <input
                type="checkbox"
                checked={allDay}
                onChange={(e) => setAllDay(e.target.checked)}
                className="h-4 w-4 accent-[var(--accent)]"
              />
              All day
            </label>

            {/* Date / datetime inputs */}
            {allDay ? (
              <div className="grid grid-cols-2 gap-3">
                <label className="grid gap-1 text-sm font-semibold text-[var(--ink)]">
                  Start date
                  <input
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    className="rounded-xl border border-[var(--line)] bg-white px-3 py-2 font-normal outline-none focus:border-[var(--accent)]"
                  />
                </label>
                <label className="grid gap-1 text-sm font-semibold text-[var(--ink)]">
                  End date
                  <input
                    type="date"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    className="rounded-xl border border-[var(--line)] bg-white px-3 py-2 font-normal outline-none focus:border-[var(--accent)]"
                  />
                </label>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-3">
                <label className="grid gap-1 text-sm font-semibold text-[var(--ink)]">
                  Start
                  <input
                    type="datetime-local"
                    value={startDatetime}
                    onChange={(e) => setStartDatetime(e.target.value)}
                    className="rounded-xl border border-[var(--line)] bg-white px-3 py-2 font-normal outline-none focus:border-[var(--accent)]"
                  />
                </label>
                <label className="grid gap-1 text-sm font-semibold text-[var(--ink)]">
                  End
                  <input
                    type="datetime-local"
                    value={endDatetime}
                    onChange={(e) => setEndDatetime(e.target.value)}
                    className="rounded-xl border border-[var(--line)] bg-white px-3 py-2 font-normal outline-none focus:border-[var(--accent)]"
                  />
                </label>
              </div>
            )}

            {/* Title */}
            <label className="grid gap-1 text-sm font-semibold text-[var(--ink)]">
              Title
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Optional title…"
                className="rounded-xl border border-[var(--line)] bg-white px-3 py-2 font-normal outline-none transition focus:border-[var(--accent)]"
              />
            </label>

            {/* Notes */}
            <label className="grid gap-1 text-sm font-semibold text-[var(--ink)]">
              Notes
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Optional notes…"
                rows={3}
                className="resize-none rounded-xl border border-[var(--line)] bg-white px-3 py-2 font-normal outline-none transition focus:border-[var(--accent)]"
              />
            </label>

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
            {isPending ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}

function todayStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
