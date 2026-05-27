"use client";

import { useMemo, useState, useTransition } from "react";

import type { Customer } from "@/types/planner";

type CustomerNameModalProps = {
  customers: Customer[];
  onClose: () => void;
  onSaved: (customers: Customer[]) => void | Promise<void>;
};

type DraftState = Record<string, string>;

function buildDrafts(customers: Customer[]): DraftState {
  return Object.fromEntries(
    customers.map((customer) => [String(customer.id), customer.name]),
  );
}

export default function CustomerNameModal({
  customers,
  onClose,
  onSaved,
}: CustomerNameModalProps) {
  const [drafts, setDrafts] = useState<DraftState>(() => buildDrafts(customers));
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const sortedCustomers = useMemo(
    () =>
      [...customers].sort((left, right) =>
        left.name.localeCompare(right.name, undefined, {
          sensitivity: "base",
        }),
      ),
    [customers],
  );

  const changedCustomers = useMemo(
    () =>
      sortedCustomers
        .map((customer) => {
          const key = String(customer.id);
          const nextName = (drafts[key] ?? "").trim();
          const currentName = customer.name.trim();
          if (nextName === currentName) return null;
          return {
            id: customer.id,
            name: nextName,
            currentName: customer.name,
          };
        })
        .filter(
          (
            customer,
          ): customer is {
            id: Customer["id"];
            name: string;
            currentName: string;
          } =>
            customer !== null,
        ),
    [drafts, sortedCustomers],
  );

  function updateDraft(customerId: Customer["id"], value: string) {
    setDrafts((current) => ({
      ...current,
      [String(customerId)]: value,
    }));
  }

  function handleSubmit() {
    setError(null);

    for (const customer of changedCustomers) {
      if (customer.name === "") {
        setError(`Customer names cannot be empty.`);
        return;
      }
    }

    startTransition(async () => {
      try {
        const response = await fetch("/api/admin/customers", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            customers: changedCustomers.map((customer) => ({
              id: customer.id,
              name: customer.name,
            })),
          }),
        });
        const json = await response.json();
        if (!response.ok) {
          throw new Error(
            (json as { error?: string }).error ?? "Failed to save customer names",
          );
        }
        await onSaved((json as { customers?: Customer[] }).customers ?? []);
      } catch (err) {
        setError(
          err instanceof Error
            ? err.message
            : "Failed to save customer names",
        );
      }
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--ink)]/40 p-4">
      <div className="flex max-h-[90vh] w-full max-w-3xl flex-col overflow-hidden rounded-3xl bg-[var(--panel)] shadow-panel">
        <div className="flex items-center justify-between gap-4 border-b border-[var(--line)] px-6 py-4">
          <div>
            <h2 className="font-display text-xl font-semibold text-[var(--ink)]">
              Customer names
            </h2>
            <p className="text-sm text-[var(--muted)]">
              Rename customers used in the planner.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full border border-[var(--line)] px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] text-[var(--muted)] transition hover:border-[var(--ink)] hover:text-[var(--ink)]"
          >
            Close
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5">
          {sortedCustomers.length === 0 ? (
            <p className="rounded-2xl border border-dashed border-[var(--line)] bg-white/60 px-4 py-6 text-center text-sm text-[var(--muted)]">
              No customers yet.
            </p>
          ) : (
            <div className="grid gap-3">
              {sortedCustomers.map((customer) => (
                <div
                  key={String(customer.id)}
                  className="grid gap-3 rounded-2xl border border-[var(--line)] bg-[var(--panel-2)] px-4 py-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)] md:items-center"
                >
                  <div>
                    <p className="font-semibold text-[var(--ink)]">
                      {customer.name}
                    </p>
                  </div>
                  <label className="grid gap-1 text-sm font-semibold text-[var(--ink)]">
                    <span className="text-[10px] uppercase tracking-[0.18em] text-[var(--muted)]">
                      Name
                    </span>
                    <input
                      type="text"
                      value={drafts[String(customer.id)] ?? ""}
                      onChange={(event) =>
                        updateDraft(customer.id, event.target.value)
                      }
                      placeholder="Customer name"
                      className="rounded-xl border border-[var(--line)] bg-white px-3 py-2 font-normal outline-none transition focus:border-[var(--accent)]"
                    />
                  </label>
                </div>
              ))}
            </div>
          )}

          {error ? (
            <p className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-900">
              {error}
            </p>
          ) : null}
        </div>

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
            disabled={isPending || changedCustomers.length === 0}
            className="rounded-full bg-[var(--accent)] px-5 py-2 text-sm font-bold uppercase tracking-[0.14em] text-white transition hover:bg-[var(--ink)] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isPending ? "Saving…" : "Save names"}
          </button>
        </div>
      </div>
    </div>
  );
}
