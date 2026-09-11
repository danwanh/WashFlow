# Frontend Pages and Components Refactor

## Goal

Refactor the current frontend so `App.tsx` no longer contains all pages, shared UI,
mock data, and modal implementations in one file. Preserve the existing Vietnamese UI,
CSS visual language, interactions, API calls, and order workflow.

## Routing

Use the existing `react-router-dom` dependency with these routes:

- `/` redirects to `/queue`
- `/queue` renders the work queue
- `/overview` renders the operations overview
- `/orders` renders the orders page
- `/machines` renders the machine monitoring page

The top navigation uses `NavLink` or equivalent router navigation so active state comes
from the current URL rather than a local page-name state.

## Structure

```text
frontend/src/
├── App.tsx
├── app/routes.tsx
├── pages/
│   ├── QueuePage.tsx
│   ├── OverviewPage.tsx
│   ├── OrdersPage.tsx
│   └── MachinesPage.tsx
├── components/
│   ├── layout/          # AppShell, Topbar, navigation
│   ├── queue/           # task cards, queue machine pane, upcoming rows
│   ├── overview/        # KPI and chart cards
│   ├── machines/        # machine icon and board cards
│   ├── orders/          # order table
│   └── modals/          # modal frame, detail, create-order, scenarios
├── data/mockTasks.ts
└── types/task.ts
```

Components receive explicit props for data and callbacks. Page-level coordination owns
shared task, selected task, modal, toast, drag, and filter state. The create-order modal
keeps its internal form and API state, including preview-before-confirm behavior.

## State and behavior

- Preserve the current task completion, filtering, drag-and-drop, toast, and modal flows.
- Preserve `previewOrder` before `createOrder`; do not persist or change API payloads.
- Keep mock task data and task types outside the application shell.
- Use router navigation for page changes while retaining shared layout and modal behavior.
- Do not introduce backend work, new business rules, or visual redesign.

## Verification

Run from `frontend/`:

1. `npm run lint`
2. `npm run format:check`
3. `npm run build`

Confirm the route paths compile, the root redirect works, and the existing page/modal
interactions remain available.
