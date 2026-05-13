"use client";

import { useState, useTransition } from "react";

import AvailabilityCalendar from "@/components/admin/AvailabilityCalendar";
import ExceptionFormModal from "@/components/admin/ExceptionFormModal";
import type {
  Id,
  WorkerAvailabilityException,
  WorkerListItem,
} from "@/types/planner";

type ExceptionModalState =
  | null
  | { mode: "create"; workerId?: Id; workerName?: string; initialDate?: string }
  | { mode: "edit"; exception: WorkerAvailabilityException; workerName: string };

export default function AvailabilityPageShell({
  initialWorkers,
}: {
  initialWorkers: WorkerListItem[];
}) {
  const [workers, setWorkers] = useState<WorkerListItem[]>(initialWorkers);
  const [exceptionModal, setExceptionModal] = useState<ExceptionModalState>(null);
  const [, startTransition] = useTransition();

  async function refreshWorkers() {
    const res = await fetch("/api/admin/workers", { cache: "no-store" });
    if (res.ok) {
      const json = (await res.json()) as { workers: WorkerListItem[] };
      setWorkers(json.workers ?? []);
    }
  }

  function formatDateStr(date: Date): string {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, "0");
    const d = String(date.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }

  return (
    <div className="flex h-[calc(100vh-5rem)] min-h-[640px] flex-col overflow-hidden rounded-3xl border border-[var(--line)] bg-[var(--panel)] shadow-panel">
      {/* Toolbar */}
      <div className="flex items-center gap-3 border-b border-[var(--line)] bg-[var(--panel)] px-5 py-3 md:px-6">
        <div className="flex flex-col leading-tight">
          <h1 className="font-display text-xl font-semibold text-[var(--ink)]">
            Availability
          </h1>
          <p className="text-xs text-[var(--muted)]">
            {workers.length} worker{workers.length === 1 ? "" : "s"}
          </p>
        </div>
        <div className="ml-auto">
          <button
            type="button"
            onClick={() => setExceptionModal({ mode: "create" })}
            className="rounded-full bg-[var(--accent)] px-4 py-2 text-sm font-bold uppercase tracking-[0.14em] text-white transition hover:bg-[var(--ink)]"
          >
            + Add exception
          </button>
        </div>
      </div>

      {/* Calendar */}
      <div className="min-h-0 flex-1 overflow-auto">
        <AvailabilityCalendar
          workers={workers}
          onAddException={(workerId, workerName, date) =>
            setExceptionModal({
              mode: "create",
              workerId,
              workerName,
              initialDate: formatDateStr(date),
            })
          }
          onEditException={(exception, workerName) =>
            setExceptionModal({ mode: "edit", exception, workerName })
          }
          onDeleteException={() =>
            startTransition(async () => {
              await refreshWorkers();
            })
          }
        />
      </div>

      {/* Exception modal */}
      {exceptionModal !== null && (
        <ExceptionFormModal
          mode={exceptionModal.mode}
          workerId={
            exceptionModal.mode === "create"
              ? exceptionModal.workerId
              : exceptionModal.exception.worker_id
          }
          workerName={
            exceptionModal.mode === "create"
              ? exceptionModal.workerName
              : exceptionModal.workerName
          }
          workers={
            exceptionModal.mode === "create" && !exceptionModal.workerId
              ? workers
              : undefined
          }
          initialDate={
            exceptionModal.mode === "create" ? exceptionModal.initialDate : undefined
          }
          initialData={
            exceptionModal.mode === "edit" ? exceptionModal.exception : undefined
          }
          onSave={() => {
            setExceptionModal(null);
            startTransition(async () => {
              await refreshWorkers();
            });
          }}
          onClose={() => setExceptionModal(null)}
        />
      )}
    </div>
  );
}
