# Pearce Planner — Architecture Reference

> **Purpose:** Living reference for UI/UX and feature work. Update this file when the architecture changes.

---

## What the app does

Pearce Planner is a baler manufacturing scheduler. Given a baler type and a start date, it runs an in-memory algorithm that assigns production stages (pressing, welding, spraying, etc.) to workers based on their skills and daily capacity. The result is persisted to Supabase and rendered as a Gantt chart.

---

## Directory map

```
pearce_gantt/
├── app/
│   ├── api/
│   │   ├── gantt/route.ts             # GET  — fetch all Gantt assignments
│   │   └── schedule-order/route.ts    # POST — create order + assignments
│   ├── schedule/page.tsx              # Main page (server component)
│   ├── layout.tsx                     # Root layout
│   ├── page.tsx                       # Redirects / → /schedule
│   └── globals.css                    # CSS variables + Tailwind base
├── components/
│   ├── BalerScheduleForm.tsx          # Form panel + schedule trigger (client)
│   ├── WorkerGantt.tsx                # Gantt grid + row layout (client)
│   └── GanttBar.tsx                   # Single assignment bar (client)
├── lib/
│   ├── scheduler.ts                   # Pure scheduling algorithm
│   ├── scheduler.test.ts              # Vitest tests
│   ├── dates.ts                       # Workday/date helpers
│   ├── supabaseAdmin.ts               # Server-only Supabase client (service role)
│   └── supabaseClient.ts              # Browser-safe Supabase client (anon key)
├── types/
│   └── planner.ts                     # All TypeScript types
└── context/
    └── ARCHITECTURE.md                # This file
```

---

## Tech stack

| Layer | Choice |
|---|---|
| Framework | Next.js 16 (App Router) |
| Language | TypeScript 5.6 (strict) |
| UI library | React 19 |
| Styling | Tailwind CSS 3 + CSS custom properties |
| Database | Supabase (PostgreSQL) |
| Testing | Vitest 2 |

---

## Design tokens (CSS variables)

Defined in `app/globals.css`. These drive all color and typography decisions.

```css
--font-display   /* serif  — Iowan Old Style, Palatino, Book Antiqua */
--font-body      /* sans   — Avenir Next, Gill Sans, Trebuchet */
--ink            /* #14212b — primary text */
--muted          /* #62707d — secondary / label text */
--paper          /* #f8f3e8 — page background */
--panel          /* rgba(255, 252, 244, 0.86) — card/panel bg */
--line           /* rgba(20, 33, 43, 0.13) — borders */
--accent         /* #c4542d — rust/orange highlight */
```

Background: layered radial + linear gradient (beige/green/blue tones) applied to `<body>`.

Tailwind extensions (`tailwind.config.ts`):
- `font-display` / `font-body` utility classes
- `shadow-panel` — `0 4px 24px rgba(21, 31, 45, 0.14)`

---

## Pages & routing

### `/schedule` — `app/schedule/page.tsx`

The only real page. It is a **server component** marked `export const dynamic = "force-dynamic"`.

On every request it:
1. Fetches active baler types from `stg_baler_types`
2. Fetches current assignments from `vw_gantt_assignments`
3. Passes both as props to `<BalerScheduleForm>`

Layout: hero header + optional error alert + `<BalerScheduleForm>`.

---

## Components

### `BalerScheduleForm` (client)

The interactive shell of the app.

**Props:** `initialBalerTypes: BalerType[]`, `initialAssignments: GanttAssignment[]`

**State:**
- `startDate` — YYYY-MM-DD string, defaults to today
- `balerTypeId` — selected baler
- `assignments` — current Gantt rows, updated after each schedule action
- `lastSchedule` — response summary from the last POST
- `error` — error string if scheduling fails
- `isPending` — from `useTransition`, gates the submit button

**Layout:** two-panel flex row
- **Left (sticky sidebar):** date input, baler dropdown, Schedule button, error alert, order summary card
- **Right:** `<WorkerGantt>`

**On submit:** POST → `/api/schedule-order`, then GET → `/api/gantt` to refresh.

---

### `WorkerGantt` (client)

Renders a scrollable time-grid Gantt chart.

**Props:** `assignments: GanttAssignment[]`

**Derived state (no useState — all computed from props):**
- Groups assignments by `worker_name`
- Calculates date range (`minDate` → `maxDate`)
- Computes `left` and `width` as percentage strings for each bar

**Constants:**
- `ROW_HEIGHT = 64` px
- `DAY_WIDTH = 112` px

**Layout:**
- Sticky header row: worker name column (13rem) + day label columns
- Worker rows: `position: relative` with absolutely-positioned `<GanttBar>` children
- Vertical grid lines at each day boundary

**Color palette** (6 colors, rotated by order index):
```
#2563eb  #c4542d  #16835b  #d97706  #7c3aed  #0891b2
```

---

### `GanttBar` (client)

A single assignment block inside a worker row.

**Props:** `assignment`, `color` (hex), `left` (CSS %), `width` (CSS %)

Renders:
- Background color fill
- Order number (top line, truncated)
- Stage name + hours (bottom line, truncated)
- `title` tooltip with full detail

---

## API routes

### `POST /api/schedule-order`

Creates one order and all its work assignments.

**Request body:**
```json
{ "balerTypeId": 1, "startDate": "2026-05-11" }
```

**Flow:**
1. Validate body (400 if bad)
2. Fetch baler type (404 if not found)
3. Fetch requirements, workers, existing assignments in parallel
4. Call `computePlannedAssignments()` — pure in-memory (422 if scheduling fails)
5. Insert row into `stg_orders`
6. Insert rows into `int_operation_assignments`
7. Return summary

**Success response:**
```json
{
  "orderId": 12,
  "orderNumber": "O020506111234",
  "balerName": "HB550",
  "scheduledStart": "2026-05-11T08:00:00",
  "scheduledEnd": "2026-05-18T16:00:00",
  "totalScheduledHours": 58,
  "assignmentsCreated": 8
}
```

---

### `GET /api/gantt`

Returns all current assignments from `vw_gantt_assignments`, ordered by `schedule_start`.

---

## Scheduler (`lib/scheduler.ts`)

Pure function — no I/O, no side effects, fully unit-tested.

**Entry point:** `computePlannedAssignments(input: SchedulerInput): SchedulerOutput`

**Algorithm (per stage, in `stage_sequence` order):**
1. Find workers whose `skill_1` or `skill_2` matches the stage
2. For each eligible worker, simulate when they'd finish — respecting their daily capacity and all existing bookings
3. Pick the worker with the earliest finish time
4. Record the assignment; add it to the "existing assignments" pool so later stages see it
5. The next stage for this order cannot start before the previous stage ends

**Key assumptions:**
- Workday starts at **08:00**, no weekends
- Worker daily capacity is shared across all skills
- Workers can only do one thing at a time
- Stages from different orders may overlap

---

## Data types (`types/planner.ts`)

| Type | Description |
|---|---|
| `BalerType` | `{ id, name }` |
| `Worker` | Worker row with `hours_per_day`, `skill_1`, `skill_2` |
| `BalerRequirement` | Stage name, hour requirement, sequence order |
| `ExistingAssignment` | Worker booking for capacity checks |
| `PlannedAssignment` | Output of scheduler for one stage block |
| `SchedulerInput` | All data the scheduler needs |
| `SchedulerOutput` | Assignments array + start/end/total hours |
| `GanttAssignment` | Enriched view row (worker name, order number, baler name) |
| `ScheduleOrderResponse` | API response from POST /api/schedule-order |

---

## Database (Supabase)

### Tables

| Table | Role |
|---|---|
| `stg_baler_types` | Baler product types |
| `stg_baler_requirements` | Stage requirements per baler type |
| `int_workers` | Workers with skills + daily capacity |
| `stg_orders` | Created orders |
| `int_operation_assignments` | Scheduled work blocks |

### View

`vw_gantt_assignments` — joins assignments → workers, orders, baler_types. Consumed by `/api/gantt` and the initial page load.

---

## Data flow

```
GET /schedule
  └─ [server] load baler types + assignments from Supabase
       └─ <BalerScheduleForm> renders with initial data
            └─ <WorkerGantt> shows existing assignments

User clicks "Schedule"
  └─ POST /api/schedule-order
       └─ [server] fetch requirements + workers
            └─ computePlannedAssignments() [pure, in-memory]
                 └─ insert order + assignments to Supabase
  └─ GET /api/gantt
       └─ update <WorkerGantt> with new assignments
```

---

## State management

No global state library. All state lives in `BalerScheduleForm` via `useState` / `useTransition`. `WorkerGantt` and `GanttBar` are pure render components — they derive everything from props.

---

---

## Workers admin area (`/admin/workers`)

Added in May 2026. Separate from the scheduler — manages the source-of-truth worker tables.

### Routes
| Route | Description |
|---|---|
| `GET /admin/workers` | Worker list + availability calendar |
| `GET /admin/workers/[id]` | Worker profile with schedule + exceptions |

### API routes (all server-side via `supabaseAdmin`)
| Endpoint | Method | Description |
|---|---|---|
| `/api/admin/workers` | GET | List all workers with skills, schedule, exceptions |
| `/api/admin/workers` | POST | Create worker + skills + schedule |
| `/api/admin/workers/[id]` | GET | Full worker detail |
| `/api/admin/workers/[id]` | PUT | Update worker fields |
| `/api/admin/workers/[id]` | DELETE | Soft-delete worker |
| `/api/admin/workers/[id]/skills` | PUT | Replace full skill set |
| `/api/admin/workers/[id]/schedule` | PUT | Replace 7-day default schedule |
| `/api/admin/workers/[id]/exceptions` | POST | Create availability exception |
| `/api/admin/workers/[id]/exceptions/[eid]` | PUT | Update exception |
| `/api/admin/workers/[id]/exceptions/[eid]` | DELETE | Soft-delete exception |

### Source tables (editable)
- `stg_workers` — canonical worker records
- `stg_worker_skills` — worker trade/skill rows
- `worker_default_schedule` — weekly recurring schedule (7 rows per worker)
- `worker_availability_exceptions` — holidays, overtime, custom shifts, unavailable periods

### Read-only / derived tables (do not edit via admin UI)
- `int_workers` — scheduler-facing flattened view (worker_id → stg_workers.id, not PK)
- `int_operation_assignments` — scheduler output

### Components
| Component | Type | Description |
|---|---|---|
| `components/admin/WorkersAdminShell` | Client | Shell: worker list + calendar tabs, manages modals |
| `components/admin/WorkerFormModal` | Client | Create/edit worker — name, hours, skills, weekly schedule |
| `components/admin/AvailabilityCalendar` | Client | 28-day scrollable grid: workers × dates, color-coded exceptions |
| `components/admin/ExceptionFormModal` | Client | Add/edit availability exception |
| `components/admin/WorkerProfileShell` | Client | Worker detail page with schedule + exception CRUD |

### Key schema caveats
- `int_operation_assignments.worker_id` → `int_workers.id` (NOT `stg_workers.id`)
- `stg_workers` is the editable source of truth; `int_workers` is scheduler-derived cache
- All four admin tables currently have RLS disabled — writes are mediated server-side via `supabaseAdmin` (service role key), never exposed to the browser

### Exception types
- `holiday` — worker unavailable (amber)
- `overtime` — extra availability block (green)
- `custom_shift` — special working block (blue)
- `unavailable` — temporary unavailability (red)

---

## Environment variables

```env
NEXT_PUBLIC_SUPABASE_URL=          # used browser + server
NEXT_PUBLIC_SUPABASE_ANON_KEY=     # browser-safe reads
SUPABASE_SERVICE_ROLE_KEY=         # server-only writes (never exposed to client)
```
