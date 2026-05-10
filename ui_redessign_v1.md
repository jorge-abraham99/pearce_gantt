# Pearce Planner UI Redesign — Agent Implementation Brief

## Goal

Redesign the `/schedule` experience so production bottlenecks are easier to identify.

The current app renders a worker-only Gantt. That is useful for allocation, but it makes it hard to answer the most important planning questions:

* Which order is taking the longest?
* Which stage is blocking an order?
* Which worker is carrying the bottleneck?
* Where are idle gaps between stages?
* Can I schedule a new order without losing the planning context?

The new UI must support two switchable Gantt views:

1. **Orders view** — rows are orders, bars are stages.
2. **Workers view** — rows are workers, bars are assigned stages.

Both views must use the same existing `GanttAssignment[]` data from `/api/gantt` and `vw_gantt_assignments`.

A schedule-new-order form should live below the Gantt as a bottom panel, not as a sticky left sidebar. The Gantt should get the maximum horizontal space.

---

## Non-goals

Do not implement these in this iteration:

* Do not rewrite the scheduling algorithm.
* Do not add drag-and-drop rescheduling.
* Do not add manual assignment editing.
* Do not add due-date or late-order logic.
* Do not add dependency arrows.
* Do not add progress tracking.
* Do not add conflict/capacity warnings unless they can be derived safely from existing data.
* Do not add a new global state library.
* Do not change the Supabase write flow.
* Do not create a database migration for V1 of this UI redesign.

---

## Existing app context

The app is a Next.js App Router project.

Current page:

```txt
app/schedule/page.tsx
```

Current data flow:

```txt
GET /schedule
  -> server loads active baler types from stg_baler_types
  -> server loads assignments from vw_gantt_assignments
  -> passes both to client planner

User schedules order
  -> POST /api/schedule-order
  -> server computes assignments with lib/scheduler.ts
  -> server inserts stg_orders + int_operation_assignments
  -> client calls GET /api/gantt
  -> client refreshes assignments
```

Keep this flow.

---

## Existing database contract

The existing `vw_gantt_assignments` view already exposes all fields needed for the redesign.

Use this as the frontend assignment type:

```ts
export type GanttAssignment = {
  assignment_id: number;
  worker_id: number;
  worker_name: string;
  order_id: number;
  order_number: string;
  baler_type_id: number;
  baler_name: string;
  stage: string;
  stage_order: number;
  schedule_start: string;
  schedule_end: string;
  scheduled_hours: number;
  status: string;
};
```

Notes:

* `assignment_id` is the stable ID for selecting a bar.
* `order_id` / `order_number` are used for the Orders view.
* `worker_id` / `worker_name` are used for the Workers view.
* `stage_order` is used to sort stages within an order.
* `schedule_start` and `schedule_end` drive positioning on the timeline.
* `scheduled_hours` drives labels and summary metrics.
* There is no due date field in `stg_orders`, so due-date warnings are out of scope.

---

## Desired UX structure

Replace the current two-column layout with a full-width planning console:

```txt
/schedule

┌──────────────────────────────────────────────────────────────┐
│ Pearce Planner                                                │
│ Search…        [Orders] [Workers]        Date range controls │
├──────────────────────────────────────────────────────────────┤
│ Stats strip: Orders | Assignments | Scheduled hrs | Bottleneck│
├──────────────────────────────────────────────────────────────┤
│ Main Gantt viewport                                           │
│                                                              │
│ Orders view: rows = orders, bars = stages                    │
│ Workers view: rows = workers, bars = assigned stages         │
│                                                              │
├──────────────────────────────────────────────────────────────┤
│ Bottom panel                                                  │
│ - Selected detail panel, or                                  │
│ - Schedule new order form                                    │
└──────────────────────────────────────────────────────────────┘
```

---

## Component structure

Create this component structure:

```txt
components/planner/
├── SchedulePlanner.tsx          # Main client shell. Replaces BalerScheduleForm responsibility.
├── PlannerToolbar.tsx           # Search, view toggle, date range controls.
├── PlannerStats.tsx             # High-level derived stats.
├── GanttViewport.tsx            # Shared scroll frame and timeline layout.
├── OrderGanttView.tsx           # Rows grouped by order.
├── WorkerGanttView.tsx          # Rows grouped by worker.
├── GanttBar.tsx                 # Shared assignment bar.
├── BottomPanel.tsx              # Schedule form + selected detail area.
├── ScheduleOrderForm.tsx        # Extracted scheduling form.
└── SelectionDetails.tsx         # Detail card for selected order/assignment/worker.
```

You may keep existing files temporarily, but the target structure should be clear.

Recommended migration:

* Rename or replace `BalerScheduleForm.tsx` with `SchedulePlanner.tsx`.
* Refactor current `WorkerGantt.tsx` into `WorkerGanttView.tsx`.
* Keep `GanttBar.tsx`, but make it more generic.
* Add a new `OrderGanttView.tsx`.

---

## SchedulePlanner responsibilities

`SchedulePlanner` is the main client component.

Props:

```ts
type SchedulePlannerProps = {
  initialBalerTypes: BalerType[];
  initialAssignments: GanttAssignment[];
};
```

State:

```ts
type PlannerView = "orders" | "workers";

type Selection =
  | { type: "assignment"; assignmentId: number }
  | { type: "order"; orderId: number }
  | { type: "worker"; workerId: number }
  | null;
```

Use this state:

```ts
const [view, setView] = useState<PlannerView>("orders");
const [query, setQuery] = useState("");
const [assignments, setAssignments] = useState(initialAssignments);
const [selection, setSelection] = useState<Selection>(null);
const [isScheduleOpen, setIsScheduleOpen] = useState(false);
const [lastSchedule, setLastSchedule] = useState<ScheduleOrderResponse | null>(null);
const [error, setError] = useState<string | null>(null);
const [isPending, startTransition] = useTransition();
```

Derived values:

```ts
const filteredAssignments = useMemo(
  () => filterAssignments(assignments, query),
  [assignments, query]
);

const timeline = useMemo(
  () => buildTimeline(filteredAssignments),
  [filteredAssignments]
);

const orderRows = useMemo(
  () => buildOrderRows(filteredAssignments),
  [filteredAssignments]
);

const workerRows = useMemo(
  () => buildWorkerRows(filteredAssignments),
  [filteredAssignments]
);

const stats = useMemo(
  () => buildPlannerStats(filteredAssignments),
  [filteredAssignments]
);
```

---

## Data shaping helpers

Create a new helper file:

```txt
lib/plannerViewModel.ts
```

### Types

```ts
export type PlannerView = "orders" | "workers";

export type TimelineDay = {
  date: Date;
  iso: string;
  label: string;
  isWeekend: boolean;
  isToday: boolean;
};

export type TimelineModel = {
  start: Date;
  end: Date;
  days: TimelineDay[];
  totalDays: number;
};

export type PositionedAssignment = GanttAssignment & {
  leftPct: number;
  widthPct: number;
  startDate: Date;
  endDate: Date;
};

export type OrderGanttRow = {
  orderId: number;
  orderNumber: string;
  balerName: string;
  start: Date;
  end: Date;
  totalHours: number;
  idleGapHours: number;
  longestStageHours: number;
  assignments: PositionedAssignment[];
};

export type WorkerGanttRow = {
  workerId: number;
  workerName: string;
  totalHours: number;
  assignmentCount: number;
  assignments: PositionedAssignment[];
};

export type PlannerStats = {
  orderCount: number;
  assignmentCount: number;
  scheduledHours: number;
  workerCount: number;
  longestOrder?: {
    orderId: number;
    orderNumber: string;
    durationDays: number;
  };
  largestIdleGap?: {
    orderId: number;
    orderNumber: string;
    idleGapHours: number;
  };
  busiestWorker?: {
    workerId: number;
    workerName: string;
    totalHours: number;
  };
};
```

### Required functions

```ts
export function filterAssignments(
  assignments: GanttAssignment[],
  query: string
): GanttAssignment[];

export function buildTimeline(
  assignments: GanttAssignment[]
): TimelineModel;

export function positionAssignment(
  assignment: GanttAssignment,
  timeline: TimelineModel
): PositionedAssignment;

export function buildOrderRows(
  assignments: GanttAssignment[]
): OrderGanttRow[];

export function buildWorkerRows(
  assignments: GanttAssignment[]
): WorkerGanttRow[];

export function buildPlannerStats(
  assignments: GanttAssignment[]
): PlannerStats;
```

### Helper behavior

`filterAssignments` should match against:

* `order_number`
* `baler_name`
* `worker_name`
* `stage`
* `status`

Use case-insensitive matching.

`buildTimeline` should:

* Use min `schedule_start` and max `schedule_end`.
* Add one day of padding before and after when assignments exist.
* If there are no assignments, show a default two-week range starting today.
* Normalize the start to beginning of day.
* Normalize the end to end of day.

`positionAssignment` should:

* Convert dates to milliseconds.
* Calculate `leftPct` and `widthPct` relative to the timeline.
* Enforce a minimum visual width for very short assignments.

`buildOrderRows` should:

* Group by `order_id`.
* Sort each order’s assignments by `stage_order`, then `schedule_start`.
* Sort rows by earliest `schedule_start`.
* Calculate `totalHours`.
* Calculate `idleGapHours` by summing gaps between consecutive stages where the next stage starts after the previous stage ends.
* Calculate `longestStageHours`.

`buildWorkerRows` should:

* Group by `worker_id`.
* Sort worker assignments by `schedule_start`.
* Sort workers by worker name by default.
* Calculate `totalHours`.
* Calculate `assignmentCount`.

`buildPlannerStats` should:

* Count unique orders.
* Count assignments.
* Sum scheduled hours.
* Count unique workers.
* Find longest order by duration between first start and last end.
* Find largest idle gap by order.
* Find busiest worker by scheduled hours.

---

## Date and time rules

The scheduler already assumes:

* Workday starts at 08:00.
* No weekends.
* Workers can only do one thing at a time.

The UI should not reimplement scheduling rules. It should only visualize the persisted assignments.

For the Gantt timeline:

* Show calendar days as columns.
* Shade weekends softly.
* Show today as a subtle vertical band.
* Use sticky day header.
* Use sticky left row label column.
* Allow horizontal scrolling.
* Allow vertical scrolling.

---

## Orders view

Purpose:

> Help the user identify which order is blocked, stretched out, or has idle gaps.

Rows:

* One row per order.
* Label should include order number and baler name.
* Secondary metadata should show total hours and idle gap if any.

Bar content:

```txt
Stage name
Worker · hours
```

Color strategy:

* Color by stage name.
* The same stage should use the same color across orders.

Interaction:

* Clicking a row selects the order.
* Clicking a bar selects the assignment.
* Selected bar should have a visible ring/outline.
* Selected order row should be subtly highlighted.

Order row label example:

```txt
O020506111234
HB550 · 58h · 1.5d idle
```

If no idle gap exists, omit idle text.

---

## Workers view

Purpose:

> Help the user identify who is loaded, idle, or holding many stages.

Rows:

* One row per worker.
* Label should include worker name.
* Secondary metadata should show total scheduled hours and assignment count.

Bar content:

```txt
Order number
Stage · hours
```

Color strategy:

* Color by order ID/order number.
* The same order should use the same color across workers.

Interaction:

* Clicking a row selects the worker.
* Clicking a bar selects the assignment.
* Selected bar should have a visible ring/outline.

Worker row label example:

```txt
Alex
42h · 6 assignments
```

---

## Shared Gantt viewport

`GanttViewport` should provide shared layout primitives so the two views feel identical.

Recommended constants:

```ts
const DAY_WIDTH = 112;
const ORDER_ROW_HEIGHT = 72;
const WORKER_ROW_HEIGHT = 64;
const LABEL_COLUMN_WIDTH = 240;
```

The timeline width should be:

```ts
const timelineWidth = timeline.days.length * DAY_WIDTH;
```

Layout:

```txt
┌────────────── sticky header ──────────────┐
│ sticky label corner | day columns         │
├───────────────────────────────────────────┤
│ sticky row labels   | scrollable bars     │
└───────────────────────────────────────────┘
```

Implementation note:

* The outer container should handle overflow.
* Keep the left labels sticky with `left: 0`.
* Keep the header sticky with `top: 0`.
* Gantt bars should be absolutely positioned within each row.

---

## GanttBar component

Make `GanttBar` generic enough to work in both views.

Props:

```ts
type GanttBarProps = {
  assignment: PositionedAssignment;
  color: string;
  labelTop: string;
  labelBottom: string;
  isSelected: boolean;
  onSelect: () => void;
};
```

Style requirements:

* Rounded rectangle.
* Strong enough color fill to scan quickly.
* Small left accent or stronger border is acceptable.
* Truncate text cleanly.
* Use a native `title` tooltip with full details.
* Use `button` semantics for accessibility.
* Must be keyboard-focusable.

Tooltip should include:

```txt
Order: O020506111234
Baler: HB550
Stage: Welding
Worker: Alex
Hours: 8
Start: 2026-05-11 08:00
End: 2026-05-11 16:00
Status: scheduled
```

---

## Toolbar

`PlannerToolbar` should include:

1. Page title or compact title.
2. Search input.
3. View toggle.
4. Schedule button.

Search placeholder:

```txt
Search order, worker, stage…
```

View toggle labels:

```txt
Orders
Workers
```

The `+ Schedule order` button should open the bottom panel in scheduling mode.

---

## Stats strip

`PlannerStats` should show compact metrics.

Minimum cards:

1. Orders
2. Assignments
3. Scheduled hours
4. Workers

Optional derived cards if values exist:

5. Longest order
6. Largest idle gap
7. Busiest worker

Examples:

```txt
Orders
12

Scheduled
348h

Largest gap
O020506111234 · 18h

Busiest worker
Alex · 62h
```

Do not show due-soon or overdue cards in this iteration because the schema has no due date.

---

## Bottom panel

The bottom panel should support two modes:

```ts
type BottomPanelMode = "schedule" | "details";
```

Behavior:

* If the user clicks `+ Schedule order`, show schedule mode.
* If the user selects an order, worker, or assignment, show detail mode.
* If neither is active, show a compact empty state with a `+ Schedule order` button.

### Schedule mode

Extract the existing form from `BalerScheduleForm` into `ScheduleOrderForm`.

Fields:

* Baler type dropdown.
* Start date input.
* Submit button.

Request body remains:

```json
{ "balerTypeId": 1, "startDate": "2026-05-11" }
```

After successful schedule:

1. Save `lastSchedule`.
2. Refetch `/api/gantt`.
3. Update `assignments`.
4. Keep the current view.
5. Keep the current search query.
6. Select the newly created order if the response includes `orderId`.
7. Show the response summary in the bottom panel.

### Detail mode

Assignment detail should show:

* Order number.
* Baler name.
* Stage.
* Worker.
* Scheduled hours.
* Start.
* End.
* Status.

Order detail should show:

* Order number.
* Baler name.
* Start.
* End.
* Total scheduled hours.
* Number of stages.
* Idle gap hours.
* Stage list ordered by `stage_order`.

Worker detail should show:

* Worker name.
* Total scheduled hours in current filtered range.
* Number of assignments.
* Order list grouped by order number.

---

## Styling direction

Use the existing design tokens from `app/globals.css`:

```css
--font-display
--font-body
--ink
--muted
--paper
--panel
--line
--accent
```

The uploaded UI references use the same general token family:

```css
--paper: #f8f3e8;
--panel: #ffffff;
--panel-2: #fbf7ed;
--ink: #14212b;
--muted: #62707d;
--accent: #c4542d;
--line: rgba(20, 33, 43, 0.13);
--today-band: rgba(196, 84, 45, 0.10);
--weekend: rgba(20, 33, 43, 0.04);
```

Use these concepts:

* Paper-like warm background.
* White or off-white panels.
* Thin grid lines.
* Rust/orange accent for selected/today/schedule CTA.
* Muted text for metadata.
* Compact table-like Gantt density.
* Avoid oversized decorative cards that reduce chart space.

---

## Color helpers

Create deterministic colors so bars stay stable across renders.

```ts
const PALETTE = [
  "#2f6fd6",
  "#c4542d",
  "#29706c",
  "#7a4ec4",
  "#b8861a",
  "#297038",
];

export function colorForKey(key: string | number): string {
  const text = String(key);
  let hash = 0;
  for (let i = 0; i < text.length; i += 1) {
    hash = (hash * 31 + text.charCodeAt(i)) >>> 0;
  }
  return PALETTE[hash % PALETTE.length];
}
```

Use:

* Orders view: `colorForKey(assignment.stage)`
* Workers view: `colorForKey(assignment.order_id)`

---

## API route expectations

Keep existing routes:

```txt
POST /api/schedule-order
GET /api/gantt
```

Recommended `/api/gantt` ordering:

```ts
.order("schedule_start", { ascending: true })
.order("stage_order", { ascending: true })
```

If multiple `.order()` calls are awkward or unreliable, sort client-side after fetching:

```ts
assignments.sort((a, b) => {
  const startDiff = new Date(a.schedule_start).getTime() - new Date(b.schedule_start).getTime();
  if (startDiff !== 0) return startDiff;
  return a.stage_order - b.stage_order;
});
```

---

## Suggested implementation steps

### Step 1 — Types

Update `types/planner.ts` so `GanttAssignment` matches the actual view shape:

```ts
export type GanttAssignment = {
  assignment_id: number;
  worker_id: number;
  worker_name: string;
  order_id: number;
  order_number: string;
  baler_type_id: number;
  baler_name: string;
  stage: string;
  stage_order: number;
  schedule_start: string;
  schedule_end: string;
  scheduled_hours: number;
  status: string;
};
```

Ensure numeric values returned from Supabase are handled correctly. If `scheduled_hours` arrives as a string because it is `numeric`, coerce it to `Number(...)` in the API route or view model helper.

### Step 2 — View model helpers

Create `lib/plannerViewModel.ts` with the helper functions listed above.

Add unit tests for:

* Grouping by order.
* Grouping by worker.
* Search filtering.
* Timeline padding.
* Position calculation.
* Idle gap calculation.

### Step 3 — Main planner shell

Create `components/planner/SchedulePlanner.tsx`.

Move the scheduling submit/refetch behavior from `BalerScheduleForm` into this component.

### Step 4 — Toolbar and stats

Create:

```txt
PlannerToolbar.tsx
PlannerStats.tsx
```

Wire search and view toggle before building the Gantt views.

### Step 5 — Shared Gantt pieces

Create:

```txt
GanttViewport.tsx
GanttBar.tsx
```

Make sure the viewport can render either order rows or worker rows.

### Step 6 — Orders view

Create `OrderGanttView.tsx`.

This is the default view.

Rows should be grouped by order and stages should be sorted by `stage_order`.

### Step 7 — Workers view

Create `WorkerGanttView.tsx`.

This replaces the old worker-only Gantt behavior but keeps the same core idea.

### Step 8 — Bottom panel

Create:

```txt
BottomPanel.tsx
ScheduleOrderForm.tsx
SelectionDetails.tsx
```

Move the schedule form below the chart.

### Step 9 — Replace usage in page

Update `app/schedule/page.tsx`:

```tsx
<SchedulePlanner
  initialBalerTypes={balerTypes}
  initialAssignments={assignments}
/>
```

Remove the old left-sidebar layout.

### Step 10 — Polish and empty states

Add empty states:

* No assignments yet.
* No assignments match search.
* No baler types available.
* Schedule request failed.

---

## Accessibility requirements

* Gantt bars must be buttons, not plain divs.
* View toggle must expose selected state.
* Search input must have a label or `aria-label`.
* Schedule form fields must have labels.
* Selected bars must have a visible focus/selection ring.
* Keyboard users must be able to tab to bars and select them.

---

## Acceptance criteria

The implementation is complete when:

1. `/schedule` loads without changing the database schema.
2. The default view is Orders view.
3. User can toggle between Orders and Workers views.
4. Orders view groups assignments by order.
5. Workers view groups assignments by worker.
6. Search filters both views by order, baler, worker, stage, or status.
7. Gantt bars align correctly to the shared date timeline.
8. Weekend days are visually shaded.
9. Today is visually marked if it falls inside the visible range.
10. User can click a bar and see assignment details.
11. User can click an order row and see order details.
12. User can click a worker row and see worker details.
13. User can open the bottom schedule form.
14. Scheduling still uses `POST /api/schedule-order`.
15. After scheduling, the UI refetches `GET /api/gantt` and updates both views.
16. Current view and search query are preserved after scheduling.
17. No scheduler logic is changed.
18. No database migration is required.
19. TypeScript passes in strict mode.
20. Existing scheduler tests still pass.

---

## Known limitations for this iteration

* The app cannot identify truly late orders because there is no due date or promised delivery date field.
* The app can show idle gaps and heavy worker load, but not full capacity risk unless capacity math is added later.
* The app does not support drag-and-drop rescheduling.
* The app does not show dependency arrows.
* The app does not show progress/completion percentage.

---

## Future improvements

Consider these after V1 is stable:

1. Add `due_date` or `promised_date` to `stg_orders`.
2. Add order priority.
3. Add customer/project name.
4. Add drag-to-reschedule with validation.
5. Add capacity utilization by worker per day.
6. Add conflict warnings.
7. Add dependency arrows between stages.
8. Add order status transitions.
9. Add export/print view.
10. Add timeline zoom: day/week/month.
