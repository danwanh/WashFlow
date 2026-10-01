# WashFlow Agent Notes

## Repository Shape

- The implemented browser app is a Vite/React package under `frontend/`.
- `backend/` is a Node.js/TypeScript Express API with Prisma 7 and PostgreSQL. HTTP routes are under `backend/src/routes/`, request handlers under `backend/src/controllers/`, shared domain/database services under `backend/src/services/`, with batch planning in `backend/src/services/planner.ts` and event-driven rescheduling in `backend/src/services/rescheduler.ts`.
- The browser entrypoint is `frontend/src/main.tsx`; `frontend/src/App.tsx` holds shell state (modals, toasts), routes live in `frontend/src/app/routes.tsx`, pages in `frontend/src/pages/`, feature components in `frontend/src/components/`, and all API calls/types in `frontend/src/api.ts`.
- The backend Prisma schema is `backend/prisma/schema.prisma`, with connection configuration in `backend/prisma7.config.ts` and `DATABASE_URL` supplied through the backend environment.
- `.stitch/SITE.md` describes an older intended `site/` layout; follow the actual `frontend/` package and its config instead.

## Commands

- Run `npm ci` from `frontend/` to install the locked dependencies.
- Run `npm run dev` from `frontend/` for the Vite development server.
- Run `npm run lint` from `frontend/` for the repository's strict TypeScript build check; this is not ESLint.
- Run `npm run build` from `frontend/` for the required production verification (`tsc -b` followed by `vite build`).
- Run `npm run format:check` from `frontend/` to verify formatting, or `npm run format` to rewrite files.
- Run `npm ci` from `backend/` to install the backend lockfile.
- Run `npx prisma generate` from `backend/` after changing the Prisma schema or installing dependencies.
- Schema changes go through migrations in `backend/prisma/migrations/` (baseline `0_init`). Run `npx prisma migrate dev --name <change>` from `backend/` when a configured PostgreSQL database is available, and `npm run db:seed` to load sample data.
- Run `npm run dev` from `backend/` for the API watch server, `npm start` for the API server, and `npm run typecheck` for strict TypeScript verification.
- Run `npx prettier --write --single-quote --no-semi --trailing-comma all "src/**/*.ts" "package.json" "tsconfig.json"` from `backend/` to format backend code; run `npx prisma format` separately for the Prisma schema.

## Conventions

- Follow `frontend/.prettierrc.json`: no semicolons, single quotes, trailing commas, and a 100-column print width.
- Keep backend source formatted with single quotes, no semicolons, trailing commas, and no implementation-only code compressed onto one line.
- Preserve the current operational UI language: Vietnamese labels, Montserrat typography, compact queue-oriented layouts, and semantic blue/amber/emerald/red states.
- Treat `spec.md` as the workflow/domain source of truth and `db.md` as the ERD source of truth; preserve batch splitting/merging semantics through `BATCH_ITEMS` when adding data behavior.
- Keep the committed schedule separate from trial scheduling; the spec requires confirmation before persisting a final plan and locks `IN_PROGRESS` stages during rescheduling.
- Every batch runs `CLASSIFY → WASH/DRY → PACKING` as `BATCH_STAGES`; the order status is derived from those stages in `backend/src/services/workflow.ts`. There are no order-level classification or packing endpoints.
- Keep Prisma models and migrations aligned with `db.md`; preserve explicit relationships for orders, batches, batch items, stages, alerts, notifications, and appointment history.
- Never commit `backend/.env` or expose `DATABASE_URL`; use environment variables for local database credentials.

## Verification

- For frontend changes, run `npm run lint`, then `npm run format:check`, then `npm run build` from `frontend/`.
- For backend changes, run `npm run typecheck` from `backend/` and run `npm run prisma:validate` when the Prisma schema or configuration changes. Run `npm run prisma:generate` after changing the Prisma schema or installing dependencies.
- Do not treat `frontend/dist/` as source; it is build output and is ignored by git.
