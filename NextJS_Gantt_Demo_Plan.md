# Pearce Planner — Lightweight Next.js Gantt Demo Plan

## Goal

Build a small demo that lets a user:

1. Select a **start date**.
2. Select a **baler type**.
3. Click **Schedule**.
4. Generate operation assignments using scheduler logic.
5. Display the scheduled work in a **Gantt-style view**.

The first version should be intentionally small. The key thing to prove is not styling or complex editing. The key thing to prove is:

> Given a baler type, worker capacity, and stage requirements, can we create a realistic sequence of scheduled work blocks and show them visually?

---

## Current Database Model

We are using a lean dbt-style structure:

```text
stg_workers
stg_worker_skills
int_workers
stg_baler_types
stg_baler_requirements
stg_orders
int_operation_assignments
mart_order_table
```

### Main scheduling inputs

#### `stg_baler_types`

Stores available baler types.

```text
id
name
active
created_at
updated_at
deleted_at
```

Example:

```text
HB550
HB60
SC3000
MC32STD
```

#### `stg_baler_requirements`

Stores the labour recipe for each baler type.

```text
id
baler_type_id
name
stage_name
stage_hour_requirements
stage_sequence
created_at
updated_at
deleted_at
```

Example:

```text
HB550 / pressing / 10h / sequence 1
HB550 / welding / 24h / sequence 2
HB550 / spraying / 6h / sequence 3
HB550 / assembling / 18h / sequence 4
```

#### `int_workers`

Stores the cleaned worker capacity and skills.

```text
id
worker_id
name
hours_per_week
hours_per_day
skill_1
skill_2
created_at
updated_at
deleted_at
```

Example:

```text
Welder 1 / 10h per day / welding
Assembly 1 / 8h per day / assembling + pressing
```

#### `stg_orders`

Stores created orders.

```text
id
order_number
baler_type_id
status
created_at
updated_at
deleted_at
```

For the demo, when the user schedules a baler, we create one new order row.

#### `int_operation_assignments`

This is the core Gantt table.

```text
id
worker_id
order_id
baler_type_id
stage
stage_order
schedule_start
schedule_end
scheduled_hours
status
created_at
updated_at
deleted_at
```

Each row is one Gantt bar.

Example:

```text
Welder 1 / O001 / HB550 / welding / 2026-05-11 08:00 → 2026-05-11 18:00 / 10h
```

---

## MVP User Flow

```text
User opens /schedule
        ↓
Selects start date
        ↓
Selects baler type
        ↓
Clicks Schedule
        ↓
App creates an order
        ↓
Scheduler reads baler requirements and workers
        ↓
Scheduler writes rows to int_operation_assignments
        ↓
Frontend reads assignments
        ↓
Gantt graph displays worker schedule
```

---

## Pages to Build

## 1. `/schedule`

Primary demo page.

### UI elements

```text
Start date input
Baler type dropdown
Schedule button
```

### Result after scheduling

Show:

```text
Order number
Baler type
Scheduled start
Scheduled finish
Total scheduled hours
```

Then show the Gantt below.

---

## 2. `/gantt`

Optional separate route, or keep the Gantt inside `/schedule`.

For the first version, keeping everything on `/schedule` is simpler.

---

## Environment Variables

Create `.env.local` for Next.js:

```env
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
```

Important:

- `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` can be used in browser-side code.
- `SUPABASE_SERVICE_ROLE_KEY` must only be used server-side, inside API routes or server actions.

---

## Recommended Project Structure

```text
pearce-planner/
  app/
    schedule/
      page.tsx
    api/
      schedule-order/
        route.ts
      gantt/
        route.ts
  components/
    BalerScheduleForm.tsx
    WorkerGantt.tsx
    GanttBar.tsx
  lib/
    supabaseClient.ts
    supabaseAdmin.ts
    scheduler.ts
    dates.ts
  types/
    planner.ts
  .env.local
```

---

## Supabase Clients

### `lib/supabaseClient.ts`

Used for browser-safe reads if needed.

```ts
import { createClient } from "@supabase/supabase-js";

export const supabaseClient = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);
```

### `lib/supabaseAdmin.ts`

Used only server-side for inserts and scheduling.

```ts
import { createClient } from "@supabase/supabase-js";

export const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  }
);
```

---

## API Routes

## 1. `GET /api/gantt`

Returns Gantt rows from `int_operation_assignments` joined to workers, orders, and baler types.

### SQL shape

```sql
SELECT
    a.id AS assignment_id,
    a.worker_id,
    w.name AS worker_name,
    a.order_id,
    o.order_number,
    a.baler_type_id,
    bt.name AS baler_name,
    a.stage,
    a.stage_order,
    a.schedule_start,
    a.schedule_end,
    a.scheduled_hours,
    a.status
FROM int_operation_assignments a
JOIN int_workers w
    ON w.id = a.worker_id
JOIN stg_orders o
    ON o.id = a.order_id
JOIN stg_baler_types bt
    ON bt.id = a.baler_type_id
WHERE a.deleted_at IS NULL
ORDER BY
    a.schedule_start,
    a.stage_order,
    w.name;
```

For Supabase, either:

1. Create a DB view called `vw_gantt_assignments`, then query the view from Next.js.
2. Query tables separately and join in TypeScript.
3. Use an RPC function later.

For the demo, the cleanest route is to create a view.

### Suggested view

```sql
CREATE OR REPLACE VIEW vw_gantt_assignments AS
SELECT
    a.id AS assignment_id,
    a.worker_id,
    w.name AS worker_name,
    a.order_id,
    o.order_number,
    a.baler_type_id,
    bt.name AS baler_name,
    a.stage,
    a.stage_order,
    a.schedule_start,
    a.schedule_end,
    a.scheduled_hours,
    a.status
FROM int_operation_assignments a
JOIN int_workers w
    ON w.id = a.worker_id
JOIN stg_orders o
    ON o.id = a.order_id
JOIN stg_baler_types bt
    ON bt.id = a.baler_type_id
WHERE a.deleted_at IS NULL;
```

Then `GET /api/gantt` can simply call:

```ts
const { data, error } = await supabaseAdmin
  .from("vw_gantt_assignments")
  .select("*")
  .order("schedule_start", { ascending: true });
```

### Concrete `app/api/gantt/route.ts`

```ts
// app/api/gantt/route.ts
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const dynamic = "force-dynamic"; // never cache; schedule changes often

export async function GET() {
  const { data, error } = await supabaseAdmin
    .from("vw_gantt_assignments")
    .select("*")
    .order("schedule_start", { ascending: true });

  if (error) {
    console.error("[GET /api/gantt] supabase error:", error);
    return NextResponse.json(
      { error: "Failed to load gantt data" },
      { status: 500 }
    );
  }

  return NextResponse.json({ assignments: data ?? [] });
}
```

---

## 2. `POST /api/schedule-order`

Schedules a new baler order.

### Request body

```json
{
  "balerTypeId": 1,
  "startDate": "2026-05-11"
}
```

### Response body

```json
{
  "orderId": 12,
  "orderNumber": "O012",
  "balerName": "HB550",
  "scheduledStart": "2026-05-11T08:00:00",
  "scheduledEnd": "2026-05-18T16:00:00",
  "totalScheduledHours": 58,
  "assignmentsCreated": 8
}
```

### Concrete `app/api/schedule-order/route.ts`

```ts
// app/api/schedule-order/route.ts
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { computePlannedAssignments } from "@/lib/scheduler";

export const dynamic = "force-dynamic";

type ScheduleRequest = {
  balerTypeId: number;
  startDate: string; // ISO date, e.g. "2026-05-11"
};

export async function POST(request: Request) {
  // 1. Parse + validate input
  let body: ScheduleRequest;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { balerTypeId, startDate } = body ?? {};
  if (typeof balerTypeId !== "number" || !Number.isFinite(balerTypeId)) {
    return NextResponse.json(
      { error: "balerTypeId must be a number" },
      { status: 400 }
    );
  }
  if (typeof startDate !== "string" || Number.isNaN(Date.parse(startDate))) {
    return NextResponse.json(
      { error: "startDate must be an ISO date string" },
      { status: 400 }
    );
  }

  // 2. Load reference data the scheduler needs
  const [balerTypeRes, requirementsRes, workersRes, existingRes] =
    await Promise.all([
      supabaseAdmin
        .from("stg_baler_types")
        .select("id, name")
        .eq("id", balerTypeId)
        .is("deleted_at", null)
        .single(),
      supabaseAdmin
        .from("stg_baler_requirements")
        .select("*")
        .eq("baler_type_id", balerTypeId)
        .is("deleted_at", null)
        .order("stage_sequence", { ascending: true }),
      supabaseAdmin
        .from("int_workers")
        .select("*")
        .is("deleted_at", null),
      supabaseAdmin
        .from("int_operation_assignments")
        .select(
          "id, worker_id, schedule_start, schedule_end, scheduled_hours, status"
        )
        .is("deleted_at", null),
    ]);

  if (balerTypeRes.error || !balerTypeRes.data) {
    return NextResponse.json(
      { error: "Baler type not found" },
      { status: 404 }
    );
  }
  if (requirementsRes.error) {
    return NextResponse.json(
      { error: "Failed to load baler requirements" },
      { status: 500 }
    );
  }
  if (workersRes.error) {
    return NextResponse.json(
      { error: "Failed to load workers" },
      { status: 500 }
    );
  }
  if (existingRes.error) {
    return NextResponse.json(
      { error: "Failed to load existing assignments" },
      { status: 500 }
    );
  }

  // 3. Run the in-memory scheduler. NO writes happen here.
  let plan;
  try {
    plan = computePlannedAssignments({
      startDate,
      balerType: balerTypeRes.data,
      requirements: requirementsRes.data ?? [],
      workers: workersRes.data ?? [],
      existingAssignments: existingRes.data ?? [],
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Scheduler failed";
    return NextResponse.json({ error: message }, { status: 422 });
  }

  // 4. Persist atomically via the schedule_order RPC.
  //    The RPC generates the order_number on the DB side so concurrent
  //    callers can't collide on it.
  const { data: rpcData, error: rpcError } = await supabaseAdmin.rpc(
    "schedule_order",
    {
      p_baler_type_id: balerTypeId,
      p_assignments: plan.assignments,
    }
  );

  if (rpcError || !rpcData) {
    console.error("[POST /api/schedule-order] rpc error:", rpcError);
    return NextResponse.json(
      { error: "Failed to persist scheduled order" },
      { status: 500 }
    );
  }

  // rpcData is an array of one row: { order_id, order_number, assignments_created }
  const row = Array.isArray(rpcData) ? rpcData[0] : rpcData;

  return NextResponse.json({
    orderId: row.order_id,
    orderNumber: row.order_number,
    balerName: balerTypeRes.data.name,
    scheduledStart: plan.scheduledStart,
    scheduledEnd: plan.scheduledEnd,
    totalScheduledHours: plan.totalScheduledHours,
    assignmentsCreated: row.assignments_created,
  });
}
```

### Supporting `lib/scheduler.ts` signature

The route above expects a pure function called `computePlannedAssignments` that
takes inputs and returns a plan. It must NOT write to the database — writes
happen via the RPC. The implementation follows the pseudocode in the
"Scheduler Logic" section below.

```ts
// lib/scheduler.ts
import { getWorkerCapacityForDate } from "./scheduler-availability"; // see scheduler section

export type Worker = {
  id: number;
  name: string;
  hours_per_day: number;
  skill_1: string | null;
  skill_2: string | null;
};

export type BalerRequirement = {
  id: number;
  baler_type_id: number;
  stage_name: string;
  stage_hour_requirements: number;
  stage_sequence: number;
};

export type ExistingAssignment = {
  id: number;
  worker_id: number;
  schedule_start: string;
  schedule_end: string;
  scheduled_hours: number;
  status: string;
};

export type PlannedAssignment = {
  worker_id: number;
  stage: string;
  stage_order: number;
  schedule_start: string; // ISO
  schedule_end: string;   // ISO
  scheduled_hours: number;
  status: "scheduled";
};

export type SchedulerInput = {
  startDate: string;
  balerType: { id: number; name: string };
  requirements: BalerRequirement[];
  workers: Worker[];
  existingAssignments: ExistingAssignment[];
};

export type SchedulerOutput = {
  assignments: PlannedAssignment[];
  scheduledStart: string;
  scheduledEnd: string;
  totalScheduledHours: number;
};

export function computePlannedAssignments(
  input: SchedulerInput
): SchedulerOutput {
  // Implementation follows the pseudocode in the Scheduler Logic section.
  // MUST NOT call supabase. Pure function over its inputs.
  throw new Error("not implemented");
}
```

---

# Scheduler Logic

The scheduler should be deterministic and easy to explain.

## Core assumptions for MVP

```text
1. Working day starts at 08:00.
2. Worker daily capacity comes from int_workers.hours_per_day.
3. No weekends.
4. A worker can only do one thing at a time.
5. A worker's hours_per_day are shared across all skills.
6. A stage can span multiple days.
7. Stages follow stage_sequence WITHIN A SINGLE ORDER.
   Stages from DIFFERENT orders are independent and can run in parallel
   on different workers. A stage's earliest start is the LATER of:
     (a) the previous stage of THE SAME ORDER finishing, and
     (b) an eligible worker becoming free.
   Order N's welding has nothing to do with Order M's pressing.
8. For each stage, choose the eligible worker who can finish the stage earliest.
9. One stage is assigned to one worker at a time.
10. Frontend handles colors.
```

---

## Data needed by scheduler

### Load baler type

```ts
const balerType = await getBalerType(balerTypeId);
```

### Load requirements

```ts
const requirements = await getBalerRequirements(balerTypeId);
```

Sorted by:

```text
stage_sequence ASC
```

### Load workers

```ts
const workers = await getWorkers();
```

Eligible worker if:

```text
worker.skill_1 === stage_name OR worker.skill_2 === stage_name
```

### Load existing assignments

```ts
const assignments = await getExistingAssignments();
```

This is important because new work must not overwrite existing worker commitments.

---

## Scheduling algorithm

For each stage in the baler requirement (in `stage_sequence` order, FOR THIS ORDER):

```text
1. Find eligible workers for the stage.
2. The earliest this stage can start is:
     max(previous stage of THIS ORDER finish time, worker free time).
3. For each eligible worker, simulate when they could complete the required hours
   given their existing assignments (which may include other orders).
4. Pick the worker with earliest finish time.
5. Create assignment rows for that worker.
6. Record this stage's finish time as the predecessor for the NEXT stage of THIS order only.
```

Note: existing assignments from OTHER orders constrain *worker availability*,
but never constrain when a stage of the current order is allowed to start.
Order independence is what allows two orders to run through the plant in parallel.

---

## Pseudocode

```ts
async function scheduleOrder(balerTypeId: number, startDate: string) {
  // ---- READ PHASE (no writes yet) ----
  const requirements = await getRequirements(balerTypeId); // sorted by stage_sequence
  const workers = await getWorkers();
  const existingAssignments = await getExistingAssignments();

  // Per-order predecessor tracker. Resets for each order.
  // Tracks "when did the previous stage of THIS order finish?"
  let prevStageFinishForThisOrder = atStartOfWorkday(startDate);

  const plannedAssignments = [];

  for (const requirement of requirements) {
    const eligibleWorkers = workers.filter((worker) =>
      worker.skill_1 === requirement.stage_name ||
      worker.skill_2 === requirement.stage_name
    );

    if (eligibleWorkers.length === 0) {
      throw new Error(`No worker available for stage: ${requirement.stage_name}`);
    }

    // The stage's earliest start is the LATER of:
    //   - this order's previous stage finish, and
    //   - the worker's first free moment (computed inside simulate).
    const candidateSchedules = eligibleWorkers.map((worker) =>
      simulateWorkerSchedule({
        worker,
        stage: requirement.stage_name,
        stageOrder: requirement.stage_sequence,
        requiredHours: requirement.stage_hour_requirements,
        notBefore: prevStageFinishForThisOrder, // per-order predecessor
        existingAssignments,                    // shared across all orders
      })
    );

    const bestSchedule = chooseEarliestFinish(candidateSchedules);

    plannedAssignments.push(...bestSchedule.assignments);
    // Add to existingAssignments so subsequent stages of THIS order also
    // see the worker as busy during the just-planned interval.
    existingAssignments.push(...bestSchedule.assignments);

    // Advance the predecessor pointer for THE NEXT STAGE OF THIS ORDER ONLY.
    prevStageFinishForThisOrder = bestSchedule.finishTime;
  }

  // ---- WRITE PHASE (atomic) ----
  // Order insert + all assignment inserts must succeed together, or none of them.
  // For MVP: a single Postgres RPC function (BEGIN ... COMMIT) is the cleanest.
  // Acceptable alternative: create order, then batch-insert assignments in one
  // call, and on failure DELETE the order before returning.
  const order = await rpcScheduleOrder({
    balerTypeId,
    plannedAssignments,
  });

  await rebuildMartOrder(order.id);

  return summarizeSchedule(order, plannedAssignments);
}
```

---

## Worker availability simulation

We do not have a calendar table right now. So for the first version, availability is inferred from:

```text
int_workers.hours_per_day
existing assignments for that worker
weekends are unavailable
```

**Important:** Wrap the daily capacity lookup in a function from day one. The
scheduler must NEVER read `worker.hours_per_day` directly. This way, when a
calendar / availability table is added later, only this function changes.

```ts
// lib/scheduler.ts

// TODO: Replace with calendar-aware lookup once a worker_availability /
// worker_absences table exists. Will need to handle: public holidays,
// part-time schedules, sick days, training, contractor windows, etc.
// The scheduler MUST call this function instead of reading worker.hours_per_day
// directly, so the swap is a one-place change.
export function getWorkerCapacityForDate(worker: Worker, date: Date): number {
  if (isWeekend(date)) return 0;
  return worker.hours_per_day;
}
```

For a given worker and day:

```text
capacity_today = getWorkerCapacityForDate(worker, day)
booked_today   = sum(existing scheduled hours for that worker on that day)
available_today = capacity_today - booked_today
```

If available hours are positive, schedule work on that day.

Example:

```text
Welder 1 has 10 hours/day (per getWorkerCapacityForDate).
Already scheduled today: 6 hours.
Remaining today: 4 hours.
New welding stage needs 14 hours.

Assign:
Today: 4h
Next working day: 10h
```

---

## Date helpers

Create `lib/dates.ts`.

Needed helpers:

```ts
isWeekend(date)
nextWorkingDay(date)
atStartOfWorkday(date)
addWorkingHours(start, hours)
getWorkDate(date)
```

For MVP:

```text
Workday starts: 08:00
Workday length: worker.hours_per_day
No lunch handling yet
```

If a worker has 10 hours/day, their day is:

```text
08:00 → 18:00
```

If a worker has 8 hours/day:

```text
08:00 → 16:00
```

---

## Gantt Rendering

## First version: simple worker Gantt

Rows are workers.

Bars are assignments.

```text
Welder 1      [O001 welding] [O002 welding]
Welder 2      [O003 welding]
Sprayer 1                   [O001 spraying]
Assembly 1    [O001 pressing]          [O001 assembling]
```

### Gantt data type

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

---

## WorkerGantt component

### Props

```ts
type WorkerGanttProps = {
  assignments: GanttAssignment[];
};
```

### Rendering logic

```text
1. Group assignments by worker_name.
2. Determine min schedule_start and max schedule_end.
3. Create a time scale.
4. Render each worker as a row.
5. Render each assignment as an absolutely positioned bar.
```

For the first version, use days as the x-axis unit.

---

## Frontend color handling

Do not store colors in the database.

In frontend:

```ts
const palette = [
  "#2563eb",
  "#ef4444",
  "#22c55e",
  "#f97316",
  "#8b5cf6",
  "#06b6d4",
];

function getOrderColor(orderNumber: string, orderNumbers: string[]) {
  const index = orderNumbers.indexOf(orderNumber);
  return palette[index % palette.length];
}
```

---

## Minimal UI Layout

```text
--------------------------------------------------
Pearce Planner Demo
--------------------------------------------------
Start date: [ 2026-05-11 ]
Baler type: [ HB550 ▼ ]
[ Schedule ]
--------------------------------------------------
Scheduled Order
O004 / HB550
Start: 2026-05-11 08:00
Finish: 2026-05-18 16:00
Total hours: 58
--------------------------------------------------
Worker Gantt
--------------------------------------------------
```

---

## Build Steps

## Step 1: Add Supabase env vars

Create `.env.local`.

## Step 2: Create Supabase clients

Create:

```text
lib/supabaseClient.ts
lib/supabaseAdmin.ts
```

## Step 3: Create Gantt view in Supabase

Run the following SQL blocks in the Supabase SQL editor, in order. Each block
is independent and idempotent.

### 3a. Indexes

These speed up the two hot queries: rendering the Gantt sorted by time, and
finding existing assignments for a given worker during scheduling.

```sql
CREATE INDEX IF NOT EXISTS idx_op_assignments_schedule_start
  ON int_operation_assignments (schedule_start)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_op_assignments_worker_schedule
  ON int_operation_assignments (worker_id, schedule_start)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_op_assignments_order
  ON int_operation_assignments (order_id)
  WHERE deleted_at IS NULL;
```

### 3b. Sanity check constraint

Catches scheduler bugs at write time (negative hours, end-before-start) rather
than letting them silently corrupt the Gantt.

```sql
ALTER TABLE int_operation_assignments
  ADD CONSTRAINT chk_assignment_times
  CHECK (schedule_end > schedule_start AND scheduled_hours >= 0);
```

### 3c. Gantt view

```sql
CREATE OR REPLACE VIEW vw_gantt_assignments AS
SELECT
    a.id AS assignment_id,
    a.worker_id,
    w.name AS worker_name,
    a.order_id,
    o.order_number,
    a.baler_type_id,
    bt.name AS baler_name,
    a.stage,
    a.stage_order,
    a.schedule_start,
    a.schedule_end,
    a.scheduled_hours,
    a.status
FROM int_operation_assignments a
JOIN int_workers w     ON w.id = a.worker_id
JOIN stg_orders o      ON o.id = a.order_id
JOIN stg_baler_types bt ON bt.id = a.baler_type_id
WHERE a.deleted_at IS NULL;
```

### 3d. Row Level Security (permissive policies for the MVP)

Enable RLS on every table now with a permissive policy. This is a no-op today
(the anon key still works for everything) but means that when auth is added,
tightening security is a one-line policy change per table rather than a full
audit. The service role key (used by API routes) bypasses RLS, so scheduler
writes are unaffected.

```sql
ALTER TABLE stg_workers               ENABLE ROW LEVEL SECURITY;
ALTER TABLE stg_worker_skills         ENABLE ROW LEVEL SECURITY;
ALTER TABLE int_workers               ENABLE ROW LEVEL SECURITY;
ALTER TABLE stg_baler_types           ENABLE ROW LEVEL SECURITY;
ALTER TABLE stg_baler_requirements    ENABLE ROW LEVEL SECURITY;
ALTER TABLE stg_orders                ENABLE ROW LEVEL SECURITY;
ALTER TABLE int_operation_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE mart_order_table          ENABLE ROW LEVEL SECURITY;

CREATE POLICY allow_all_mvp ON stg_workers               FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY allow_all_mvp ON stg_worker_skills         FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY allow_all_mvp ON int_workers               FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY allow_all_mvp ON stg_baler_types           FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY allow_all_mvp ON stg_baler_requirements    FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY allow_all_mvp ON stg_orders                FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY allow_all_mvp ON int_operation_assignments FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY allow_all_mvp ON mart_order_table          FOR ALL USING (true) WITH CHECK (true);
```

## Step 4: Create `GET /api/gantt`

Reads from `vw_gantt_assignments`. Use the concrete `route.ts` shown in the
"API Routes → 1. `GET /api/gantt`" section above.

## Step 5: Create `POST /api/schedule-order`

Runs the in-memory scheduler (`computePlannedAssignments`) and persists the
result via the `schedule_order` RPC function. Use the concrete `route.ts`
shown in the "API Routes → 2. `POST /api/schedule-order`" section above.

The order insert and the assignment inserts MUST be atomic — either all succeed
or none do. The RPC below wraps both inserts in a single PL/pgSQL block, which
Postgres runs in an implicit transaction. If anything raises, everything rolls
back, leaving no half-scheduled orders behind.

### 5a. The `schedule_order` RPC

```sql
CREATE OR REPLACE FUNCTION schedule_order(
  p_baler_type_id BIGINT,
  p_assignments   JSONB  -- array of planned assignment rows, no order_id yet
)
RETURNS TABLE (
  order_id            BIGINT,
  order_number        TEXT,
  assignments_created INT
)
LANGUAGE plpgsql
AS $$
DECLARE
  v_order_id     BIGINT;
  v_order_number TEXT;
  v_count        INT;
BEGIN
  -- 1. Insert the order. Generate order_number from the new id so concurrent
  --    callers can't collide on it. Format: O0001, O0042, etc.
  INSERT INTO stg_orders (order_number, baler_type_id, status)
  VALUES ('PENDING', p_baler_type_id, 'scheduled')
  RETURNING id INTO v_order_id;

  v_order_number := 'O' || LPAD(v_order_id::TEXT, 4, '0');

  UPDATE stg_orders
  SET order_number = v_order_number
  WHERE id = v_order_id;

  -- 2. Insert all assignments referencing the new order.
  INSERT INTO int_operation_assignments (
    worker_id, order_id, baler_type_id, stage, stage_order,
    schedule_start, schedule_end, scheduled_hours, status
  )
  SELECT
    (a->>'worker_id')::BIGINT,
    v_order_id,
    p_baler_type_id,
    a->>'stage',
    (a->>'stage_order')::INT,
    (a->>'schedule_start')::TIMESTAMP,
    (a->>'schedule_end')::TIMESTAMP,
    (a->>'scheduled_hours')::NUMERIC,
    COALESCE(a->>'status', 'scheduled')
  FROM jsonb_array_elements(p_assignments) a;

  GET DIAGNOSTICS v_count = ROW_COUNT;

  -- If either INSERT raises (FK violation, check constraint, etc.) the
  -- whole function rolls back automatically. No half-scheduled state.
  RETURN QUERY SELECT v_order_id, v_order_number, v_count;
END;
$$;
```

## Step 6: Create `/schedule` page

Includes:

```text
Date picker
Baler type dropdown
Schedule button
WorkerGantt component
```

## Step 7: Build `WorkerGantt`

Simple absolute-position Gantt, grouped by worker.

## Step 8: Test with one baler

Use:

```text
Start date: 2026-05-11
Baler type: HB550
```

Expected:

```text
pressing assigned to Assembly worker
welding assigned to Welder
spraying assigned to Sprayer
assembling assigned to Assembly worker
```

## Step 9: Test with multiple orders

Schedule multiple balers and confirm:

```text
Workers are not double-booked.
Stages happen in sequence.
Assignments skip weekends.
Gantt chart updates.
```

---

## What Not To Build Yet

Do not build these in the first version:

```text
manual drag-and-drop
worker absence by week
worker availability / calendar table
   (the scheduler is shielded from this via getWorkerCapacityForDate;
    add the table and update the function when needed)
contractor logic
auth
multi-user permissions
complex order editing
calendar exceptions
ML forecasting
```

The first goal is simply:

> Select date + select baler + schedule work + show Gantt.

---

## Success Criteria

The demo is successful when:

```text
1. The user can select a start date and baler type.
2. The app creates a new order.
3. The scheduler creates assignment rows.
4. Workers are not overbooked.
5. Stages happen in correct sequence.
6. The Gantt chart shows the generated schedule.
7. Scheduling a second baler respects the first baler’s existing assignments.
```

---

## Core Principle

Keep the system simple:

```text
stg tables = source data
int_workers = worker capacity + skills
int_operation_assignments = generated schedule blocks
Gantt = visualization of schedule blocks
```

The Gantt does not calculate the schedule. It only displays the result of the scheduler.
