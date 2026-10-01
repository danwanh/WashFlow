# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

WashFlow is a single-store laundry workflow system: it takes laundry groups + weights, splits/merges them into machine-feasible batches, schedules sorting/washing/drying/packing stages, computes ETAs against the promised `pickup_at`, reschedules on events, and raises alerts. There is no auth, staff, or store management.

`.agents/AGENTS.md` holds additional agent notes; some of its paths are stale (the planner is `backend/src/services/planner.ts`, and the UI is split into pages/components rather than concentrated in `App.tsx`). `.stitch/SITE.md` describes an obsolete `site/` layout; ignore it.

## Source-of-truth documents

- `spec.md` — domain/workflow rules: status models, merge matrix, Modified Best-Fit-Decreasing batching, scheduling and rescheduling rules. Consult before changing planner/workflow behavior.
- `db.md` — ERD; keep `backend/prisma/schema.prisma` aligned with it.
- `api.md` — HTTP contract: error shape, enums, stage model and timing fields, stage endpoints. Its intro still says the backend is "only a scaffold", and `/api/queue`, `/api/overview` and `POST /api/alerts/scan` are not documented there.
- `.stitch/DESIGN.md` — UI design system.

## Commands

Backend (`backend/`, Express 5 + Prisma 7 + PostgreSQL, ESM, run via `tsx`):

```sh
npm ci
npm run prisma:generate   # after schema changes or install; outputs to backend/generated/prisma (gitignored)
npm run prisma:validate   # after schema/config changes
npm run dev               # watch server on PORT (default 3000)
npm run typecheck         # tsc --noEmit (strict, noUncheckedIndexedAccess, exactOptionalPropertyTypes)
npm run db:seed           # wipes all tables, then seeds via prisma/seed.ts
npm test                  # tsx --test (node:test); pass files explicitly, e.g.:
npx tsx --test src/services/planner.test.ts
npx tsx --test --test-name-pattern "WASH_DRY" src/services/planner.test.ts
```

Requires `DATABASE_URL` in `backend/.env` (read by `prisma7.config.ts` and `services/api.ts`). Optional env: `PORT`, `PLAN_SECRET`, `CLASSIFY_OFFSET_MINUTES` (default 10), `PACKING_OFFSET_MINUTES` (15), `STAGE_APPROACHING_THRESHOLD_MINUTES` (5), `ALERT_WAITING_THRESHOLD_MINUTES` (30), `ALERT_UNLOAD_THRESHOLD_MINUTES` (15), `ALERT_PACKING_THRESHOLD_MINUTES` (30), `ALERT_READY_THRESHOLD_MINUTES` (30), `TICK_INTERVAL_SECONDS` (10; background ticker, `0` disables it).

Migrations live in `prisma/migrations/`; `0_init` is a baseline of the schema as it was when migrations were introduced. An existing database created without migrations must be baselined first (`npx prisma migrate resolve --applied 0_init`) before `prisma migrate dev`, otherwise Prisma detects drift and offers to reset it.

Backend formatting (no config file): `npx prettier --write --single-quote --no-semi --trailing-comma all "src/**/*.ts"`; `npx prisma format` for the schema.

Frontend (`frontend/`, Vite + React 18 + TanStack Query + React Router 7):

```sh
npm ci
npm run dev
npm run lint          # tsc -b type check — there is no ESLint
npm run format:check  # prettier (format to rewrite); several files already fail it
npm run build         # tsc -b && vite build — required verification
```

API base URL comes from `VITE_API_URL` (default `http://localhost:3000/api`).

## Backend architecture

`src/server.ts` mounts routers under `/api/{orders,batches,machines,alerts,queue,overview}` plus `/health`. Layering: `routes/` (thin Router wiring) → `controllers/` (request parsing, orchestration) → `services/` (domain logic + Prisma).

- `services/api.ts` — shared Prisma client (with `@prisma/adapter-pg`), `ApiError`/`fail()` (caught by the global error handler and rendered as `{ error: { code, message, details } }`), input helpers (`getId`, `getDate`, `getBody`), `orderInclude`, `orderResource` (snake_case order view; stages in workflow order with timing fields), and the in-memory `planStore`.
- `services/planner.ts` — pure, DB-free `buildPlan()`: maps item types to compatibility groups (fixed table; unknown → `SPECIAL`), applies the merge matrix, BFD batch packing against machine capacities, a bounded local search, and trial scheduling. Every planned batch gets `CLASSIFY → [WASH] → [DRY] → PACKING`; the manual stages have `machineId: null`, and the ETA is the latest PACKING end. Unit-tested in `planner.test.ts`.
- `services/rescheduler.ts` — split into `loadScheduleState` → pure `computeSchedule` → `applySchedule`, so trial schedules run in memory; `evaluateOrder` / `earliestFeasiblePickup` (binary search) back order planning, creation and pickup changes (tested in `rescheduler.test.ts`). Order ETAs are projected so unfinished work never ends before now. `rescheduleAll(reason)` re-plans every non-completed order in a transaction: `IN_PROGRESS`/`MACHINE_FINISHED` stages are locked; `PLANNED` stages are picked by least slack, then priority, pickup, creation time. Machine stages go to the earliest-finishing machine; manual stages just get a time window (an already-started CLASSIFY keeps its real start). It keeps the loaded stage objects in sync with what it writes so later stages and ETAs use the new times, then updates batch/order ETAs and creates `LATE_RISK` alerts.
- `services/workflow.ts` — `updateStage` (start / machine-finished / unload). `machine-finished` on a CLASSIFY or PACKING stage completes it. A stage can only be acted on after every earlier stage of its batch is completed. `syncOrderStatus` derives the order status from the stages after every transition; it is never set directly. Also notifications (a successful final notification moves the order to `COMPLETED`; content `__FAIL__` simulates a failure).
- `services/timing.ts` — `stageTiming`/`batchTimings`: the single set of wait/late rules (`phase`, `timing_status`, `late_at`, `waiting_since`, Vietnamese labels) used by the queue and the order resource. Only a batch's next unfinished stage is measured: machine stages are late after their planned start, manual stages after their planned end, running stages after actual start + planned length, unloads after `ALERT_UNLOAD_THRESHOLD_MINUTES`.
- `services/alerts.ts` — `scanAlerts()` (late risk, forgotten waiting/unload/packing/notification); run by `services/ticker.ts` every `TICK_INTERVAL_SECONDS` and by `POST /api/alerts/scan`. Machine-finished alerts are recorded/resolved by workflow transitions.
- `services/ticker.ts` — server timer started from `server.ts`: `autoFinishMachines()` (in `workflow.ts`; marks `WASH`/`DRY` stages `MACHINE_FINISHED` once actual start + planned length has passed, at that end time, then reschedules) followed by `scanAlerts()`. `GET /api/queue` also calls `autoFinishMachines()` first. Manual `machine-finished` still works to finish a cycle early.
- `services/events.ts` + `GET /api/events` — Server-Sent Events. A middleware in `server.ts` calls `notifyChange(['queue', 'alerts'])` after every successful non-GET request (except `/plan` and `/scan`); `autoFinishMachines` and alert scans that change something notify too. Frontend `hooks/useLiveUpdates.ts` (mounted in `App.tsx`) refetches the shared queue query and fires `ALERTS_CHANGED_EVENT` for `AlertBell`; polling (60 s) is only a fallback.
- `controllers/machines.ts` — staff only switch a machine between in service and `MAINTENANCE` (one switch on the Machines page); `AVAILABLE` only from `MAINTENANCE`. Going into maintenance stops the running batch (stage back to `PLANNED`, re-planned elsewhere) and moves planned work; `preview: true` returns that impact for the confirm modal. There is no `OFFLINE` status.
- `controllers/queue.ts` builds the work queue on every `GET /api/queue`: one task per batch (its next unfinished stage, including sorting and packing) plus an order-level NOTIFY task for `READY` orders, with timing fields and `order_late_minutes`, sorted by slack, priority, pickup.

Two-phase order creation (spec requires confirmation before persisting a schedule): `POST /api/orders/plan` runs a trial plan (batches from the planner, ETA and affected orders from inserting them into the whole schedule), stores it in `planStore` for 10 minutes keyed by an HMAC `plan_id`; `POST /api/orders` with that `plan_id` persists it and re-checks the schedule in the same transaction (or fails `409 STALE_PLAN`) and starts every CLASSIFY stage. Because `planStore` is in-process memory, plans are lost on server restart.

Order status follows the stages: `RECEIVED` until every CLASSIFY is done → `WAITING` → `FOLDING_PACKING` once only PACKING remains → `READY` when every stage is done → `COMPLETED` after a successful notification. There are no order-level classification or packing endpoints. Batches link to order items through `BATCH_ITEMS`, which supports both splitting one item across batches and merging several items into one batch — preserve this when touching data behavior.

## Frontend architecture

`main.tsx` sets up the QueryClient; `App.tsx` owns shell-level state (modals, refresh token) and renders `app/routes.tsx` (`/queue` default, `/overview`, `/orders`, `/machines`). `src/api.ts` holds all API types and fetch functions (snake_case fields mirroring the backend responses). Pages live in `pages/`, feature components in `components/<feature>/`.

- Queue (`pages/QueuePage.tsx`, `components/queue/QueueComponents.tsx`): reads the queue through `hooks/useQueue.ts` (one shared TanStack Query fetch of `/api/queue`, refetched on server change events and after every action, polled every 60 s as a fallback) and maps tasks to `types/task.ts`. Bags are dragged onto machines to start a stage. When a machine's cycle ends the server finishes it automatically (the page reloads at the earliest running cycle's end); it then stops spinning and shows the bag, which is dragged back onto its queue row to unload; both drops act immediately. Rows show live timing plus a planned-time note; rows past their pickup time get the strong `pickup-overdue` state, and rows whose ETA is late get a lighter "Nguy cơ trễ hẹn" badge.
- `utils/timing.ts` re-derives the backend timing every second from its timestamps (`liveTiming`), so labels count down without waiting for a refresh.
- Notifications: `hooks/useStatusFeed.ts` watches the same shared queue data and `utils/statusDiff.ts` turns real order/stage status changes between polls into notices rendered by `components/layout/AppShell.tsx`. Call `feed.refresh()` after an action to report it immediately. The Topbar queue badge shows the real task count. In `npm run dev` only (`import.meta.env.DEV`), a bottom-left "Đóng tất cả thông báo" button clears the notices and the pending alert popups locally (alert data is untouched).
- Order detail (`DetailModal` in `components/modals/ModalComponents.tsx`): per-batch Phân loại → Giặt → Sấy → Đóng gói timeline with planned windows, ✓ plus actual completion time for finished stages, and a primary action derived from the batch's next stage.

## Conventions

- Prettier style everywhere: no semicolons, single quotes, trailing commas, 100-column width (frontend `.prettierrc.json`). Some backend files (e.g. `routes/queue.ts`, `routes/alerts.ts`, `services/alerts.ts`) still use double quotes/semicolons.
- Backend imports use `.js` extensions (NodeNext ESM); Prisma types come from `../../generated/prisma/client.js`.
- UI language is Vietnamese (including backend-generated labels such as timing text); keep Montserrat typography, compact queue-oriented layouts, and semantic blue/amber/emerald/red states.
