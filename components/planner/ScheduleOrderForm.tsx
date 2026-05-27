"use client";

import { useState, useTransition } from "react";

import type {
  BalerType,
  Customer,
  ScheduleOrderResponse,
} from "@/types/planner";

type ScheduleOrderFormProps = {
  balerTypes: BalerType[];
  customers: Customer[];
  onScheduled: (response: ScheduleOrderResponse) => void;
  onManageCustomers: () => void;
  onClose: () => void;
};

const NEW_CUSTOMER_VALUE = "__new_customer__";

function todayDateValue() {
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export default function ScheduleOrderForm({
  balerTypes,
  customers,
  onScheduled,
  onManageCustomers,
  onClose,
}: ScheduleOrderFormProps) {
  const [startDate, setStartDate] = useState(todayDateValue);
  const [balerTypeId, setBalerTypeId] = useState<string>(
    balerTypes[0] ? String(balerTypes[0].id) : "",
  );
  const [customerSelection, setCustomerSelection] = useState<string>(
    customers[0] ? customers[0].name : NEW_CUSTOMER_VALUE,
  );
  const [newCustomer, setNewCustomer] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const customer =
    customerSelection === NEW_CUSTOMER_VALUE ? newCustomer : customerSelection;

  function submit() {
    setError(null);
    startTransition(async () => {
      try {
        const scheduleRes = await fetch("/api/schedule-order", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            balerTypeId,
            customer: customer.trim(),
            startDate,
          }),
        });
        const json = await scheduleRes.json();
        if (!scheduleRes.ok) {
          throw new Error(json.error ?? "Failed to schedule order");
        }
        onScheduled(json as ScheduleOrderResponse);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Scheduling failed");
      }
    });
  }

  const canSubmit =
    !isPending && balerTypeId !== "" && customer.trim() !== "" && startDate !== "";

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="font-display text-xl font-semibold text-[var(--ink)]">
            Schedule a new order
          </h3>
          <p className="text-sm text-[var(--muted)]">
            Pick a machine type and start date. Stages are auto-assigned.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onManageCustomers}
            className="rounded-full border border-[var(--line)] px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] text-[var(--muted)] hover:border-[var(--ink)] hover:text-[var(--ink)]"
          >
            Rename customers
          </button>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full border border-[var(--line)] px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] text-[var(--muted)] hover:border-[var(--ink)] hover:text-[var(--ink)]"
          >
            Close
          </button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-[1fr_1fr_1fr_auto] md:items-end">
        <label className="grid gap-1 text-sm font-semibold text-[var(--ink)]">
          Start date
          <input
            type="date"
            value={startDate}
            onChange={(event) => setStartDate(event.target.value)}
            className="rounded-xl border border-[var(--line)] bg-white px-3 py-2 outline-none transition focus:border-[var(--accent)]"
          />
        </label>
        <label className="grid gap-1 text-sm font-semibold text-[var(--ink)]">
          Customer
          <select
            value={customerSelection}
            onChange={(event) => setCustomerSelection(event.target.value)}
            className="rounded-xl border border-[var(--line)] bg-white px-3 py-2 outline-none transition focus:border-[var(--accent)]"
          >
            {customers.map((item) => (
              <option key={String(item.id)} value={item.name}>
                {item.name}
              </option>
            ))}
            <option value={NEW_CUSTOMER_VALUE}>Add new customer...</option>
          </select>
          {customerSelection === NEW_CUSTOMER_VALUE ? (
            <input
              type="text"
              value={newCustomer}
              onChange={(event) => setNewCustomer(event.target.value)}
              placeholder="Customer name"
              className="rounded-xl border border-[var(--line)] bg-white px-3 py-2 outline-none transition focus:border-[var(--accent)]"
            />
          ) : null}
        </label>
        <label className="grid gap-1 text-sm font-semibold text-[var(--ink)]">
          Machine type
          <select
            value={balerTypeId}
            onChange={(event) => setBalerTypeId(event.target.value)}
            disabled={balerTypes.length === 0}
            className="rounded-xl border border-[var(--line)] bg-white px-3 py-2 outline-none transition focus:border-[var(--accent)]"
          >
            {balerTypes.length === 0 ? (
              <option value="">No machine types available</option>
            ) : null}
            {balerTypes.map((balerType) => (
              <option key={String(balerType.id)} value={String(balerType.id)}>
                {balerType.name}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          onClick={submit}
          disabled={!canSubmit}
          className="rounded-xl bg-[var(--accent)] px-5 py-2.5 text-sm font-bold uppercase tracking-[0.14em] text-white transition hover:bg-[var(--ink)] disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isPending ? "Scheduling…" : "Schedule"}
        </button>
      </div>

      {error ? (
        <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-900">
          {error}
        </p>
      ) : null}
    </div>
  );
}
