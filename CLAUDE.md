# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

WashFlow is a single-store laundry workflow system: it takes laundry groups + weights, splits/merges them into machine-feasible batches, schedules washer/dryer stages, computes ETAs against the promised `pickup_at`, reschedules on events, and raises alerts. There is no auth, staff, or store management.

`.agents/AGENTS.md` holds additional agent notes. `.stitch/SITE.md` describes an obsolete `site/` layout; ignore it.

## Source-of-truth documents

- `spec.md` — domain/workflow rules: status models, merge matrix, Modified Best-Fit-Decreasing batching, scheduling and rescheduling rules. Consult before changing planner/workflow behavior.
- `db.md` — ERD; keep `backend/prisma/schema.prisma` aligned with it.
- `api.md` — HTTP contract as implemented (error shape, enums, every endpoint, alert thresholds). Update it alongside route/response changes.
- `.stitch/DESIGN.md` — UI design system.

## Commands

Backend (`backend/`, Express 5 + Prisma 7 + PostgreSQL, ESM, run via `tsx`):

```sh
npm ci
npm run prisma:generate   # after schema changes or install; outputs to backend/generated/prisma (gitignored)
npm run prisma:validate   # after schema/config changes
npm run dev               # watch server on PORT (default 3000)
npm run typecheck         # tsc --noEmit (strict, noUncheckedIndexedAccess, exactOptionalPropertyTypes)
npx prisma migrate dev --name <change>   # after editing schema.prisma
npm run db:seed           # seed via prisma/seed.ts
npm test                  # tsx --test (node:test); pass files explicitly, e.g.:
npx tsx --test src/services/planner.test.ts
npx tsx --test --test-name-pattern "WASH_DRY" src/services/planner.test.ts
```

Requires `DATABASE_URL` in `backend/.env` (read by `prisma7.config.ts` and `services/api.ts`). Optional env: `PORT`, `PLAN_SECRET`, `CLASSIFY_OFFSET_MINUTES` (default 10), `PACKING_OFFSET_MINUTES` (default 15), `STAGE_APPROACHING_THRESHOLD_MINUTES`, and `ALERT_*_THRESHOLD_MINUTES` (see `api.md`). Migrations live in `prisma/migrations/`; `0_init` is a baseline of the schema as it was when migrations were introduced.

Backend formatting (no config file): `npx prettier --write --single-quote --no-semi --trailing-comma all "src/**/*.ts"`; `npx prisma format` for the schema.

Frontend (`frontend/`, Vite + React 18 + TanStack Query + React Router 7):

```sh
npm ci
npm run dev
npm run lint          # tsc -b type check — there is no ESLint
npm run format:check  # prettier (format to rewrite)
npm run build         # tsc -b && vite build — required verification
```

API base URL comes from `VITE_API_URL` (default `http://localhost:3000/api`).

## Backend architecture

`src/server.ts` mounts routers under `/api/{orders,batches,machines,alerts,queue,overview}` plus `/health`. Layering: `routes/` (thin Router wiring) → `controllers/` (request parsing, orchestration) → `services/` (domain logic + Prisma).

- `services/api.ts` — shared Prisma client (with `@prisma/adapter-pg`), `ApiError`/`fail()` (caught by the global error handler and rendered as `{ error: { code, message, details } }`), input helpers (`getId`, `getDate`, `getBody`), the standard `orderInclude`, and the in-memory `planStore`.
- `services/planner.ts` — pure, DB-free `buildPlan()`: maps item types to compatibility groups, applies the merge matrix, BFD batch packing against machine capacities, and trial-schedules stages to produce an ETA/feasibility. Unit-tested in `planner.test.ts`.
- `services/rescheduler.ts` — `rescheduleAll(reason)` re-plans every non-completed order in a transaction; `IN_PROGRESS` stages are locked, `BUSY` machines treated as unavailable, `OFFLINE`/`MAINTENANCE` excluded. Called after new orders, machine status changes, stage unload, classification/packing completion, batch composition edits, and manual reschedule.
- `services/workflow.ts` — stage transitions (start/machine-finished/unload), `syncOrderStatus` (derives the order status from its stages after every transition), and notifications (a successful final notification moves the order to `COMPLETED`).
- `services/alerts.ts` — `scanAlerts()` detects late/forgotten work; machine-finished alerts are recorded/resolved from workflow transitions.

Two-phase order creation (spec requires confirmation before persisting a schedule): `POST /api/orders/plan` runs a trial plan, stores it in `planStore` for 10 minutes keyed by an HMAC `plan_id`; `POST /api/orders` with that `plan_id` persists it (or fails `409 STALE_PLAN`). Because `planStore` is in-process memory, plans are lost on server restart.

Every batch has the stages `CLASSIFY → [WASH] → [DRY] → PACKING`; `CLASSIFY`/`PACKING` are manual, machine-less stages completed through `POST /api/batches/:b/stages/:s/machine-finished`. The order status is never set directly: `RECEIVED` until all CLASSIFY stages finish → `WAITING` → `FOLDING_PACKING` once only PACKING remains → `READY` when all stages finish → `COMPLETED` after a successful notification (the only order-level action). Batches link to order items through `BATCH_ITEMS`, which supports both splitting one item across batches and merging several items into one batch — preserve this when touching data behavior.

## Frontend architecture

`main.tsx` sets up the QueryClient; `App.tsx` owns shell-level state (modals, toasts, refresh token) and renders `app/routes.tsx` (`/queue` default, `/overview`, `/orders`, `/machines`). `src/api.ts` holds all API types and fetch functions (snake_case fields mirroring the backend responses). Pages live in `pages/`, feature components in `components/<feature>/`. The queue page maps backend queue tasks to the `Task` type in `types/task.ts`; batch tasks advance via the stage endpoints, and only `NOTIFY` is an order-level action. The Topbar's "KỊCH BẢN" buttons are demo scenario modals, not real workflow actions.

## Conventions

- Prettier style everywhere: no semicolons, single quotes, trailing commas, 100-column width (frontend `.prettierrc.json`). Some backend files (alerts) still use double quotes/semicolons, and several frontend files currently fail `format:check`.
- Backend imports use `.js` extensions (NodeNext ESM); Prisma types come from `../../generated/prisma/client.js`.
- UI language is Vietnamese (including backend-generated labels such as timing text); keep Montserrat typography, compact queue-oriented layouts, and semantic blue/amber/emerald/red states.
