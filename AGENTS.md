# WashFlow Agent Notes

## Repository Shape

- The implemented app is a single Vite/React package under `frontend/`; there is currently no backend, Express app, CI workflow, test runner, or codegen setup in this checkout.
- The requested Node.js/Express backend is not present yet; do not invent backend commands or assume API endpoints exist.
- The browser entrypoint is `frontend/src/main.tsx`; the current UI, mock data, and interaction state are concentrated in `frontend/src/App.tsx` and `frontend/src/index.css`.
- `.stitch/SITE.md` describes an older intended `site/` layout; follow the actual `frontend/` package and its config instead.

## Commands

- Run `npm ci` from `frontend/` to install the locked dependencies.
- Run `npm run dev` from `frontend/` for the Vite development server.
- Run `npm run lint` from `frontend/` for the repository's strict TypeScript build check; this is not ESLint.
- Run `npm run build` from `frontend/` for the required production verification (`tsc -b` followed by `vite build`).
- Run `npm run format:check` from `frontend/` to verify formatting, or `npm run format` to rewrite files.
- There is no test script or single-test command currently available.

## Conventions

- Follow `frontend/.prettierrc.json`: no semicolons, single quotes, trailing commas, and a 100-column print width.
- Preserve the current operational UI language: Vietnamese labels, Montserrat typography, compact queue-oriented layouts, and semantic blue/amber/emerald/red states.
- Treat `spec.md` as the workflow/domain source of truth and `db.md` as the ERD source of truth; preserve batch splitting/merging semantics through `BATCH_ITEMS` when adding data behavior.
- Keep the committed schedule separate from trial scheduling; the spec requires confirmation before persisting a final plan and locks `IN_PROGRESS` stages during rescheduling.

## Verification

- For frontend changes, run `npm run lint`, then `npm run format:check`, then `npm run build` from `frontend/`.
- Do not treat `frontend/dist/` as source; it is build output and is ignored by git.
