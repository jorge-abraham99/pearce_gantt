"use client";

import Link from "next/link";
import { useState, useTransition } from "react";

import AvailabilityCalendar from "@/components/admin/AvailabilityCalendar";
import ExceptionFormModal from "@/components/admin/ExceptionFormModal";
import WorkerFormModal from "@/components/admin/WorkerFormModal";
import type {
  BalerType,
  Id,
  WorkerAvailabilityException,
  WorkerListItem,
} from "@/types/planner";

type WorkerModalState =
  | null
  | { mode: "create" }
  | { mode: "edit"; item: WorkerListItem };

type ExceptionModalState =
  | null
  | { mode: "create"; workerId: Id; workerName: string; initialDate?: string }
  | { mode: "edit"; exception: WorkerAvailabilityException; workerName: string };

type WorkersAdminShellProps = {
  initialWorkers: WorkerListItem[];
  initialBalerTypes: BalerType[];
};

export default function WorkersAdminShell({
  initialWorkers,
  initialBalerTypes,
}: WorkersAdminShellProps) {
  const [view, setView] = useState<"list" | "calendar">("list");
  const [workers, setWorkers] = useState<WorkerListItem[]>(initialWorkers);
  const [balerTypes, setBalerTypes] = useState<BalerType[]>(initialBalerTypes);
  const [workerModal, setWorkerModal] = useState<WorkerModalState>(null);
  const [exceptionModal, setExceptionModal] = useState<ExceptionModalState>(null);
  const [, startTransition] = useTransition();

  async function refreshWorkers() {
    const res = await fetch("/api/admin/workers", { cache: "no-store" });
    if (res.ok) {
      const json = (await res.json()) as {
        workers: WorkerListItem[];
        balerTypes?: BalerType[];
      };
      setWorkers(json.workers ?? []);
      setBalerTypes(json.balerTypes ?? []);
    }
  }

  function handleDeleteWorker(id: Id, name: string) {
    if (!confirm(`Delete "${name}"? This cannot be undone.`)) return;
    startTransition(async () => {
      const res = await fetch(`/api/admin/workers/${id}`, { method: "DELETE" });
      if (res.ok) await refreshWorkers();
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
            Staff
          </h1>
        </div>

        <div className="ml-auto flex flex-wrap items-center justify-end gap-3">
          <div
            role="tablist"
            aria-label="View"
            className="flex items-center rounded-full border border-[var(--line)] bg-white p-1 text-sm font-semibold"
          >
            <ViewTab label="List" isSelected={view === "list"} onClick={() => setView("list")} />
            <ViewTab
              label="Calendar"
              isSelected={view === "calendar"}
              onClick={() => setView("calendar")}
            />
          </div>
          <button
            type="button"
            onClick={() => setWorkerModal({ mode: "create" })}
            className="rounded-full bg-[var(--accent)] px-4 py-2 text-sm font-bold uppercase tracking-[0.14em] text-white transition hover:bg-[var(--ink)]"
          >
            + Add worker
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="min-h-0 flex-1 overflow-auto">
        {view === "list" ? (
          <WorkerList
            workers={workers}
            onEdit={(item) => setWorkerModal({ mode: "edit", item })}
            onDelete={handleDeleteWorker}
          />
        ) : (
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
            onDeleteException={() => startTransition(async () => { await refreshWorkers(); })}
          />
        )}
      </div>

      {/* Modals */}
      {workerModal !== null && (
        <WorkerFormModal
          mode={workerModal.mode}
          initialData={workerModal.mode === "edit" ? workerModal.item : undefined}
          balerTypes={balerTypes}
          onSave={() => {
            setWorkerModal(null);
            startTransition(async () => { await refreshWorkers(); });
          }}
          onClose={() => setWorkerModal(null)}
        />
      )}

      {exceptionModal !== null && (
        <ExceptionFormModal
          mode={exceptionModal.mode}
          workerId={
            exceptionModal.mode === "create"
              ? exceptionModal.workerId
              : exceptionModal.exception.worker_id
          }
          workerName={exceptionModal.workerName}
          initialDate={
            exceptionModal.mode === "create" ? exceptionModal.initialDate : undefined
          }
          initialData={
            exceptionModal.mode === "edit" ? exceptionModal.exception : undefined
          }
          onSave={() => {
            setExceptionModal(null);
            startTransition(async () => { await refreshWorkers(); });
          }}
          onClose={() => setExceptionModal(null)}
        />
      )}
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function ViewTab({
  label,
  isSelected,
  onClick,
}: {
  label: string;
  isSelected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={isSelected}
      onClick={onClick}
      className={`rounded-full px-4 py-1.5 transition ${
        isSelected
          ? "bg-[var(--ink)] text-white shadow-sm"
          : "text-[var(--muted)] hover:text-[var(--ink)]"
      }`}
    >
      {label}
    </button>
  );
}

function WorkerList({
  workers,
  onEdit,
  onDelete,
}: {
  workers: WorkerListItem[];
  onEdit: (item: WorkerListItem) => void;
  onDelete: (id: Id, name: string) => void;
}) {
  if (workers.length === 0) {
    return (
      <div className="flex h-full items-center justify-center p-10">
        <div className="rounded-3xl border border-dashed border-[var(--line)] bg-white/60 p-10 text-center">
          <p className="font-display text-2xl font-semibold">No workers yet.</p>
          <p className="mt-2 text-[var(--muted)]">Add your first worker to get started.</p>
        </div>
      </div>
    );
  }

  return (
    <table className="w-full">
      <thead className="sticky top-0 z-10">
        <tr className="border-b border-[var(--line)] bg-[var(--panel-2)]">
          <Th>Name</Th>
          <Th>Skills</Th>
          <Th>Hours / day</Th>
          <Th>Schedule</Th>
          <Th>Actions</Th>
        </tr>
      </thead>
      <tbody>
        {workers.map((item) => (
          <WorkerRow
            key={String(item.worker.id)}
            item={item}
            onEdit={onEdit}
            onDelete={onDelete}
          />
        ))}
      </tbody>
    </table>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return (
    <th className="px-5 py-3 text-left text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--muted)]">
      {children}
    </th>
  );
}

function WorkerRow({
  item,
  onEdit,
  onDelete,
}: {
  item: WorkerListItem;
  onEdit: (item: WorkerListItem) => void;
  onDelete: (id: Id, name: string) => void;
}) {
  const { worker, skills, defaultSchedule } = item;
  return (
    <tr className="border-b border-[var(--line-faint)] transition hover:bg-[var(--panel-2)]">
      <td className="px-5 py-3">
        <Link
          href={`/admin/workers/${worker.id}`}
          className="font-semibold text-[var(--ink)] transition hover:text-[var(--accent)]"
        >
          {worker.name}
        </Link>
      </td>
      <td className="px-5 py-3">
        <div className="flex flex-wrap gap-1">
          {skills.length === 0 ? (
            <span className="text-sm text-[var(--muted)]">—</span>
          ) : (
            skills.map((s) => (
              <span
                key={String(s.id)}
                className="rounded-full bg-[var(--ink)] px-2 py-0.5 text-[11px] font-semibold text-white"
              >
                {s.skill}
              </span>
            ))
          )}
        </div>
      </td>
      <td className="px-5 py-3 text-sm text-[var(--ink)]">{worker.hours_per_day}h</td>
      <td className="px-5 py-3 text-sm text-[var(--muted)]">
        {formatScheduleSummary(defaultSchedule)}
      </td>
      <td className="px-5 py-3">
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => onEdit(item)}
            className="rounded-full border border-[var(--line)] px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] text-[var(--muted)] transition hover:border-[var(--ink)] hover:text-[var(--ink)]"
          >
            Edit
          </button>
          <button
            type="button"
            onClick={() => onDelete(worker.id, worker.name)}
            className="rounded-full border border-red-200 px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] text-red-500 transition hover:border-red-500 hover:text-red-700"
          >
            Delete
          </button>
        </div>
      </td>
    </tr>
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const DAY_SHORT = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function formatScheduleSummary(
  schedule: WorkerListItem["defaultSchedule"],
): string {
  if (schedule.length === 0) return "—";
  const working = schedule.filter((s) => s.is_working);
  if (working.length === 0) return "No working days";
  const days = working.map((s) => DAY_SHORT[s.day_of_week - 1]).join(", ");
  const first = working[0];
  const hours =
    first.start_time && first.end_time ? ` · ${first.start_time}–${first.end_time}` : "";
  return `${days}${hours}`;
}

function formatDateStr(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}
