"use client";

import { useMemo, useState, useTransition } from "react";

import type { BalerAdminRow } from "@/types/planner";

const STAGE_FIELDS = [
  { key: "weldingHours", label: "Welding", stageName: "welding" },
  { key: "assemblyHours", label: "Assembly", stageName: "assembling" },
  { key: "sprayingHours", label: "Spraying", stageName: "spraying" },
] as const;

type StageKey = (typeof STAGE_FIELDS)[number]["key"];

type StageValues = Record<StageKey, string>;

type BalerFormModalProps = {
  mode: "create" | "edit";
  initialData?: BalerAdminRow;
  onSave: () => void;
  onClose: () => void;
};

export default function BalerFormModal({
  mode,
  initialData,
  onSave,
  onClose,
}: BalerFormModalProps) {
  const [name, setName] = useState(initialData?.name ?? "");
  const [hours, setHours] = useState<StageValues>({
    weldingHours: String(initialData?.weldingHours ?? ""),
    assemblyHours: String(initialData?.assemblyHours ?? ""),
    sprayingHours: String(initialData?.sprayingHours ?? ""),
  });
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const total = useMemo(() => {
    const vals = Object.values(hours).map(Number);
    if (vals.some((v) => !Number.isFinite(v) || v < 0)) return null;
    return vals.reduce((acc, v) => acc + v, 0);
  }, [hours]);

  const isValid =
    name.trim() !== "" &&
    total !== null &&
    Object.values(hours).every((v) => v !== "" && Number(v) >= 0);

  function handleHourChange(key: StageKey, value: string) {
    setHours((prev) => ({ ...prev, [key]: value }));
  }

  function handleSubmit() {
    setError(null);

    if (!name.trim()) {
      setError("Baler name is required.");
      return;
    }
    for (const { label, key } of STAGE_FIELDS) {
      const v = Number(hours[key]);
      if (!Number.isFinite(v) || v < 0) {
        setError(`${label} hours must be a non-negative number.`);
        return;
      }
    }

    const payload = {
      name: name.trim(),
      weldingHours: Number(hours.weldingHours),
      assemblyHours: Number(hours.assemblyHours),
      sprayingHours: Number(hours.sprayingHours),
    };

    startTransition(async () => {
      try {
        const url =
          mode === "create"
            ? "/api/admin/balers"
            : `/api/admin/balers/${initialData!.id}`;
        const method = mode === "create" ? "POST" : "PUT";

        const res = await fetch(url, {
          method,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
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
          <h2 className="font-display text-xl font-semibold text-[var(--ink)]">
            {mode === "create" ? "Add baler" : `Edit ${initialData?.name ?? "baler"}`}
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
          <div className="grid gap-5">
            {/* Baler name */}
            <label className="grid gap-1 text-sm font-semibold text-[var(--ink)]">
              Baler name
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. HB550"
                className="rounded-xl border border-[var(--line)] bg-white px-3 py-2 font-normal outline-none transition focus:border-[var(--accent)]"
              />
            </label>

            {/* Stage hours */}
            <div>
              <p className="mb-3 text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--muted)]">
                Stage hours
              </p>
              <div className="grid gap-3 sm:grid-cols-2">
                {STAGE_FIELDS.map(({ key, label }) => (
                  <label
                    key={key}
                    className="grid gap-1 text-sm font-semibold text-[var(--ink)]"
                  >
                    {label}
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        min="0"
                        step="0.5"
                        value={hours[key]}
                        onChange={(e) => handleHourChange(key, e.target.value)}
                        placeholder="0"
                        className="w-full rounded-xl border border-[var(--line)] bg-white px-3 py-2 font-normal tabular-nums outline-none transition focus:border-[var(--accent)]"
                      />
                      <span className="shrink-0 text-xs text-[var(--muted)]">h</span>
                    </div>
                  </label>
                ))}
              </div>
            </div>

            {/* Total (read-only) */}
            <div className="flex items-center justify-between rounded-2xl border border-[var(--line)] bg-[var(--panel-2)] px-4 py-3">
              <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--muted)]">
                Total hours
              </span>
              <span className="font-display text-2xl font-semibold tabular-nums text-[var(--ink)]">
                {total !== null ? `${total}h` : "—"}
              </span>
            </div>

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
            disabled={!isValid || isPending}
            className="rounded-full bg-[var(--accent)] px-5 py-2 text-sm font-bold uppercase tracking-[0.14em] text-white transition hover:bg-[var(--ink)] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isPending ? "Saving…" : mode === "create" ? "Add baler" : "Save changes"}
          </button>
        </div>
      </div>
    </div>
  );
}
