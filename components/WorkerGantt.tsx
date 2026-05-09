"use client";

import GanttBar from "@/components/GanttBar";
import type { GanttAssignment } from "@/types/planner";

type WorkerGanttProps = {
  assignments: GanttAssignment[];
};

const DAY_MS = 24 * 60 * 60 * 1000;
const ROW_HEIGHT = 64;
const DAY_WIDTH = 112;

export default function WorkerGantt({ assignments }: WorkerGanttProps) {
  const sortedAssignments = [...assignments].sort(
    (left, right) =>
      new Date(left.schedule_start).getTime() - new Date(right.schedule_start).getTime(),
  );

  const workers = groupByWorker(sortedAssignments);
  const orderNumbers = Array.from(new Set(sortedAssignments.map((item) => item.order_number)));
  const minDate = getStartOfDay(sortedAssignments[0]?.schedule_start);
  const maxDate = getStartOfDay(getMaxEnd(sortedAssignments));
  const dayCount =
    minDate && maxDate ? Math.max(1, Math.ceil((maxDate.getTime() - minDate.getTime()) / DAY_MS) + 1) : 0;
  const days = Array.from({ length: dayCount }, (_, index) => addDays(minDate!, index));

  return (
    <section className="min-w-0 rounded-[1.75rem] border border-[var(--line)] bg-white/75 p-6 shadow-panel backdrop-blur">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="font-display text-3xl font-semibold">Worker Gantt</h2>
          <p className="mt-2 text-sm text-[var(--muted)]">
            {assignments.length} scheduled work blocks across {workers.length} workers.
          </p>
        </div>
      </div>

      {assignments.length === 0 ? (
        <div className="mt-8 rounded-3xl border border-dashed border-[var(--line)] bg-white/60 p-10 text-center">
          <p className="font-display text-2xl font-semibold">No scheduled work yet.</p>
          <p className="mt-2 text-[var(--muted)]">Create a schedule to populate the chart.</p>
        </div>
      ) : (
        <div className="mt-6 overflow-x-auto pb-2">
          <div style={{ minWidth: 220 + dayCount * DAY_WIDTH }}>
            <div className="grid grid-cols-[13rem_1fr] border-b border-[var(--line)] pb-3 text-xs font-bold uppercase tracking-[0.15em] text-[var(--muted)]">
              <div>Worker</div>
              <div className="relative" style={{ height: 28 }}>
                {days.map((day, index) => (
                  <div
                    key={day.toISOString()}
                    className="absolute top-0"
                    style={{ left: index * DAY_WIDTH, width: DAY_WIDTH }}
                  >
                    {formatDay(day)}
                  </div>
                ))}
              </div>
            </div>

            <div>
              {workers.map(({ workerName, workerAssignments }) => (
                <div
                  key={workerName}
                  className="grid grid-cols-[13rem_1fr] border-b border-[var(--line)]"
                  style={{ minHeight: ROW_HEIGHT }}
                >
                  <div className="flex items-center pr-4 text-sm font-semibold">{workerName}</div>
                  <div
                    className="relative"
                    style={{
                      height: ROW_HEIGHT,
                      width: dayCount * DAY_WIDTH,
                      backgroundImage:
                        "linear-gradient(to right, rgba(20,33,43,0.08) 1px, transparent 1px)",
                      backgroundSize: `${DAY_WIDTH}px 100%`,
                    }}
                  >
                    {workerAssignments.map((assignment) => (
                      <GanttBar
                        key={String(assignment.assignment_id)}
                        assignment={assignment}
                        color={getOrderColor(assignment.order_number, orderNumbers)}
                        left={positionForDate(assignment.schedule_start, minDate!, dayCount)}
                        width={widthForAssignment(assignment, dayCount)}
                      />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

function groupByWorker(assignments: GanttAssignment[]) {
  const grouped = new Map<string, GanttAssignment[]>();

  for (const assignment of assignments) {
    const workerAssignments = grouped.get(assignment.worker_name) ?? [];
    workerAssignments.push(assignment);
    grouped.set(assignment.worker_name, workerAssignments);
  }

  return Array.from(grouped.entries()).map(([workerName, workerAssignments]) => ({
    workerName,
    workerAssignments,
  }));
}

function getStartOfDay(value?: string) {
  if (!value) return null;
  const date = new Date(value);
  date.setHours(0, 0, 0, 0);
  return date;
}

function getMaxEnd(assignments: GanttAssignment[]) {
  return assignments.reduce<string | undefined>((max, assignment) => {
    if (!max) return assignment.schedule_end;
    return new Date(assignment.schedule_end).getTime() > new Date(max).getTime()
      ? assignment.schedule_end
      : max;
  }, undefined);
}

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function positionForDate(value: string, minDate: Date, dayCount: number) {
  const offset = new Date(value).getTime() - minDate.getTime();
  return `${Math.max(0, (offset / (DAY_MS * dayCount)) * 100)}%`;
}

function widthForAssignment(assignment: GanttAssignment, dayCount: number) {
  const start = new Date(assignment.schedule_start).getTime();
  const end = new Date(assignment.schedule_end).getTime();
  return `${Math.max(2, ((end - start) / (DAY_MS * dayCount)) * 100)}%`;
}

function formatDay(date: Date) {
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
  }).format(date);
}

function getOrderColor(orderNumber: string, orderNumbers: string[]) {
  const palette = ["#2563eb", "#c4542d", "#16835b", "#d97706", "#7c3aed", "#0891b2"];
  const index = Math.max(0, orderNumbers.indexOf(orderNumber));
  return palette[index % palette.length];
}
