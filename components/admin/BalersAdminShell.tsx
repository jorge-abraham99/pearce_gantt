"use client";

import { useState, useTransition } from "react";

import BalerFormModal from "@/components/admin/BalerFormModal";
import type { BalerAdminRow } from "@/types/planner";

type ModalState = null | { mode: "create" } | { mode: "edit"; baler: BalerAdminRow };

const STAGE_COLS = [
  { key: "weldingHours", label: "Welding" },
  { key: "assemblyHours", label: "Assembly" },
  { key: "sprayingHours", label: "Spraying" },
] as const;

export default function BalersAdminShell({
  initialBalers,
}: {
  initialBalers: BalerAdminRow[];
}) {
  const [balers, setBalers] = useState<BalerAdminRow[]>(initialBalers);
  const [modal, setModal] = useState<ModalState>(null);
  const [, startTransition] = useTransition();

  async function refreshBalers() {
    const res = await fetch("/api/admin/balers", { cache: "no-store" });
    if (res.ok) {
      const json = (await res.json()) as { balers: BalerAdminRow[] };
      setBalers(json.balers ?? []);
    }
  }

  function handleSaved() {
    setModal(null);
    startTransition(async () => {
      await refreshBalers();
    });
  }

  return (
    <div className="flex h-[calc(100vh-5rem)] min-h-[640px] flex-col overflow-hidden rounded-3xl border border-[var(--line)] bg-[var(--panel)] shadow-panel">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-3 border-b border-[var(--line)] bg-[var(--panel)] px-5 py-4 md:gap-4 md:px-6">
        <div className="flex flex-col">
          <p className="text-[10px] font-bold uppercase tracking-[0.24em] text-[var(--accent)]">
            Pearce Planner
          </p>
          <h1 className="font-display text-xl font-semibold leading-tight text-[var(--ink)] md:text-2xl">
            Balers
          </h1>
        </div>
        <div className="ml-auto">
          <button
            type="button"
            onClick={() => setModal({ mode: "create" })}
            className="rounded-full bg-[var(--accent)] px-4 py-2 text-sm font-bold uppercase tracking-[0.14em] text-white transition hover:bg-[var(--ink)]"
          >
            + Add baler
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="min-h-0 flex-1 overflow-auto">
        {balers.length === 0 ? (
          <EmptyState onAdd={() => setModal({ mode: "create" })} />
        ) : (
          <table className="w-full">
            <thead className="sticky top-0 z-10">
              <tr className="border-b border-[var(--line)] bg-[var(--panel-2)]">
                <Th>Baler</Th>
                {STAGE_COLS.map((c) => (
                  <Th key={c.key}>{c.label}</Th>
                ))}
                <Th>Total</Th>
                <Th>Actions</Th>
              </tr>
            </thead>
            <tbody>
              {balers.map((baler) => (
                <tr
                  key={String(baler.id)}
                  className="border-b border-[var(--line-faint)] transition hover:bg-[var(--panel-2)]"
                >
                  <td className="px-5 py-3">
                    <span className="font-semibold text-[var(--ink)]">{baler.name}</span>
                  </td>
                  {STAGE_COLS.map((c) => (
                    <td key={c.key} className="px-5 py-3 text-sm tabular-nums text-[var(--ink)]">
                      {baler[c.key]}h
                    </td>
                  ))}
                  <td className="px-5 py-3 text-sm font-semibold tabular-nums text-[var(--ink)]">
                    {baler.totalHours}h
                  </td>
                  <td className="px-5 py-3">
                    <button
                      type="button"
                      onClick={() => setModal({ mode: "edit", baler })}
                      className="rounded-full border border-[var(--line)] px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] text-[var(--muted)] transition hover:border-[var(--ink)] hover:text-[var(--ink)]"
                    >
                      Edit
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Stats footer */}
      {balers.length > 0 && (
        <div className="border-t border-[var(--line)] bg-[var(--panel-2)] px-5 py-3">
          <p className="text-sm text-[var(--muted)]">
            {balers.length} baler{balers.length === 1 ? "" : "s"}
            {" · "}avg{" "}
            {Math.round(balers.reduce((acc, b) => acc + b.totalHours, 0) / balers.length)}h
            total per build
          </p>
        </div>
      )}

      {/* Modal */}
      {modal !== null && (
        <BalerFormModal
          mode={modal.mode}
          initialData={modal.mode === "edit" ? modal.baler : undefined}
          onSave={handleSaved}
          onClose={() => setModal(null)}
        />
      )}
    </div>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return (
    <th className="px-5 py-3 text-left text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--muted)]">
      {children}
    </th>
  );
}

function EmptyState({ onAdd }: { onAdd: () => void }) {
  return (
    <div className="flex h-full items-center justify-center p-10">
      <div className="rounded-3xl border border-dashed border-[var(--line)] bg-white/60 p-10 text-center">
        <p className="font-display text-2xl font-semibold text-[var(--ink)]">
          No baler types yet.
        </p>
        <p className="mt-2 text-sm text-[var(--muted)]">
          Add your first baler to get started.
        </p>
        <button
          type="button"
          onClick={onAdd}
          className="mt-4 rounded-full bg-[var(--accent)] px-4 py-2 text-sm font-bold uppercase tracking-[0.14em] text-white transition hover:bg-[var(--ink)]"
        >
          + Add baler
        </button>
      </div>
    </div>
  );
}
