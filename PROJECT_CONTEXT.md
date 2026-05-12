# Pearce Gantt Project Context

## Current State

This repo is a root-level Next.js app for the Pearce Planner Gantt demo. The
single route `/schedule` is a planner console with an Orders view and a Workers
view, a scheduling form, and a selection details panel.

The app lets a user:

1. Open `/schedule`.
2. Search assignments, switch between Orders and Workers views.
3. In Orders view: toggle Day/Week scale, inspect each order with its tasks
   nested underneath, see Worker / Start / End columns next to each task.
4. Click `+ Schedule order` to open the scheduling form (pick start date and
   baler type, submit).
5. The Gantt refreshes from `/api/gantt` and the new order is auto-selected.

The app is implemented directly in:

```text
/Users/jorge/Documents/misc/pearce_gannt
```

## Local Setup

Install dependencies:

```bash
npm install
```

Run locally:

```bash
npm run dev
```

Open:

```text
http://localhost:3000/schedule
```

Create `.env.local` from:

```bash
cp .env.local.example .env.local
```

Required env vars:

```env
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...
```

`.env.local` is intentionally ignored by git.

`.npmrc` is configured so npm cache/logs stay inside this repo at `.npm-cache/`.
That directory is ignored by git.

## Key Files

```text
app/schedule/page.tsx
app/api/gantt/route.ts
app/api/schedule-order/route.ts

components/planner/SchedulePlanner.tsx     # top-level client component
components/planner/PlannerToolbar.tsx      # search + Orders/Workers tabs + Schedule button
components/planner/PlannerStats.tsx        # stats strip
components/planner/OrderGanttView.tsx      # nested order/task rows + Day/Week toggle
components/planner/WorkerGanttView.tsx     # one row per worker
components/planner/GanttViewport.tsx       # shared scroll viewport, columns API, units header
components/planner/GanttBar.tsx            # solid / umbrella bar variants
components/planner/ScheduleOrderForm.tsx
components/planner/SelectionDetails.tsx
components/planner/BottomPanel.tsx

lib/plannerViewModel.ts                    # timeline, scale, units, rows, display rows
lib/plannerViewModel.test.ts
lib/scheduler.ts
lib/scheduler.test.ts
lib/dates.ts
lib/supabaseAdmin.ts
lib/supabaseClient.ts
types/planner.ts
```

## Database Assumptions

The Supabase database already exists and is not managed by this repo.
No demo SQL file is currently included.

The app expects these database objects to exist:

```text
stg_baler_types
stg_baler_requirements
int_workers
stg_orders
int_operation_assignments
vw_gantt_assignments
```

The app originally planned to use a `schedule_order` RPC, but the live database
RPC did not match the expected schema. The route now writes directly with the
service-role Supabase client.

Current scheduling persistence flow in `app/api/schedule-order/route.ts`:

1. Load baler type, requirements, workers, and existing assignments.
2. Run `computePlannedAssignments`.
3. Insert one row into `stg_orders`.
4. Insert planned rows into `int_operation_assignments`.
5. If assignment insert fails, mark the created order as `failed` and soft-delete it.

Current required order insert fields:

```text
order_number
baler_type
baler_type_id
status
```

Current required assignment insert fields include:

```text
worker_id
order_id
baler_type_id
baler_name
stage
stage_order
schedule_start
schedule_end
scheduled_hours
status
```

Two live database errors were fixed:

```text
stg_orders.baler_type cannot be null
int_operation_assignments.baler_name cannot be null
```

If another `23502` error appears, it likely means the live schema has another
required denormalized column that must be included in the insert payload.

## Scheduler Behavior

Scheduler implementation lives in `lib/scheduler.ts`.

The scheduler is pure and does not call Supabase.

Current MVP rules:

```text
Working day starts at 08:00.
Weekends are skipped.
Worker daily capacity comes from int_workers.hours_per_day.
Worker skills are checked against skill_1 and skill_2.
A worker can only do one thing at a time.
Stages for one order follow stage_sequence.
Existing assignments constrain worker availability.
Stages from other orders do not block stage sequence, only worker capacity.
The eligible worker with the earliest finish is selected.
Long stages can split across multiple working days.
```

`getWorkerCapacityForDate` intentionally wraps capacity lookup so future worker
calendar or absence logic can be added in one place.

## UI Behavior

`/schedule` is the only main page. It renders a planner console with:

```text
Toolbar:        search, Orders/Workers tabs, + Schedule order button
Stats strip:    derived counts and highlights
Gantt:          Orders view or Workers view
Bottom panel:   schedule form, selection details, or empty/CTA state
```

The Gantt is a shared sticky-header viewport (`GanttViewport`) with a sticky
left label pane and a horizontally scrollable timeline. Bar positioning is
percentage-based against the timeline range, so timeline scale never shifts
bar alignment.

### Orders view

```text
- One row per order (header), with its tasks nested as additional rows underneath.
- Label pane columns: Order / Task | Worker | Start | End.
  - On the order row those columns show order number, baler, total hours,
    task count, earliest start, latest end.
  - On each task row those columns show the stage name, assigned worker,
    and that task's start/end.
- The order row also renders a faded "umbrella" bar spanning earliest start
  to latest end. Each task row renders a solid bar for that single assignment.
- Bars carry no in-bar text; details are in the label columns + tooltip.
- Bars are colored by order id (via colorForKey), so all tasks of one order
  share a color.
- Day/Week scale toggle lives in the top-right of the Gantt header strip.
  - Day:   one column per day, weekday + date label, weekend shading.
  - Week:  one column per ISO week (Monday-start), "Wk NN" + first-day date.
           Bars stay pixel-accurate inside compressed week columns.
- Clicking the order row selects the order; clicking a task row or task bar
  selects that assignment. The selected order's group is highlighted across
  its header and task rows.
```

### Workers view

```text
- One row per worker. Single "Worker" label column (unchanged layout).
- Bars colored by order id, labeled with order number + stage hours.
- Day scale only; Day/Week toggle is intentionally Orders-only.
```

Colors are computed in the frontend (`colorForKey`) and not stored in the
database. Palette is currently 6 colors, so order colors can repeat above 6
visible orders.

## Verification Commands

Known passing checks:

```bash
npm test
npm run lint
npm run build
```

`npm run build` uses:

```bash
next build --webpack
```

Reason: Next 16 default Turbopack build tried to bind a local port in the sandbox
and failed. Webpack build passed cleanly.

## Dependency Notes

This project currently uses:

```text
Next 16
React 19
TypeScript
Tailwind
Supabase JS
Vitest
ESLint 9 flat config
```

There is an npm engine warning on this machine because local Node is:

```text
v23.10.0
```

Some packages prefer:

```text
^20.19.0 || ^22.13.0 || >=24
```

The app still builds and tests on the current local Node version.

## Git State And Remote

Remote:

```text
origin https://github.com/jorge-abraham99/pearce_gantt.git
```

`main` already contains the planner-console redesign (PR #1, "Redesign
/schedule into Orders/Workers planner console", merged at 2ef720f).

Active feature branch: `gantt_chart_struct` — restructures the Orders Gantt
to nest tasks under orders, adds Worker/Start/End columns, removes in-bar
text, colors bars by order, and adds the Day/Week scale toggle.

## Recent Runtime Errors And Fixes

### RPC signature mismatch

Error:

```text
Could not find the function public.schedule_order(p_assignments, p_baler_type_id)
Hint: perhaps schedule_order(p_assignments, p_baler_type_id, p_order_number)
```

Temporary fix:

```text
Added generated p_order_number.
```

Final fix:

```text
Stopped using the incompatible RPC and inserted directly into tables.
```

### Missing `stg_orders.baler_type`

Error:

```text
null value in column "baler_type" of relation "stg_orders" violates not-null constraint
```

Fix:

```text
Insert baler_type: balerTypeRes.data.name into stg_orders.
```

### Missing `int_operation_assignments.baler_name`

Error:

```text
null value in column "baler_name" of relation "int_operation_assignments" violates not-null constraint
```

Fix:

```text
Insert baler_name: balerTypeRes.data.name into int_operation_assignments rows.
```

## Next Likely Tasks

Most likely next steps:

```text
Tooltip pass on Gantt bars: reduce hover delay and include richer details
  (order, baler, stage, worker, start/end, hours, status) now that bars
  carry no in-bar text.
Expand the color palette beyond 6 entries so order colors don't repeat
  above ~6 visible orders.
Consider replacing direct two-step inserts with a database RPC that matches
  the live schema for atomicity.
Add a lightweight README once the first live scheduling flow succeeds
  end-to-end.
```

## Important Caveat

The current direct insert flow is pragmatic for matching the existing database.
It is not fully atomic across order insert and assignment insert. The route soft-deletes
the order if assignment insertion fails, but a database RPC would be stronger long term.
