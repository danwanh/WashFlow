# WashFlow Site Constitution

## 1. Core Identity

- **Project Name:** WashFlow
- **Stitch Project ID:** `10545765533273343244`
- **Mission:** Give commercial laundry teams a single operational workspace for receiving orders, tracking garments through independent processing groups, monitoring machines, handling exceptions, and releasing completed orders for pickup.
- **Target Audience:** Laundry intake staff, wash-floor operators, quality-control staff, shift supervisors, and managers responsible for queue health and customer-ready orders.
- **Voice:** Precise, calm, professional, direct, operational, reassuring under pressure.

## 2. Visual Language

- **Primary vibe:** Nordic precision
- **Secondary vibe:** Industrial clarity
- **Tertiary vibe:** Calm command center
- **Visual rules:** Cool slate neutrals, white bordered work surfaces, compact data density, Geist for interface text, JetBrains Mono for operational data, and semantic blue/amber/emerald/red states. Use hard-edged tonal depth instead of soft decorative shadows.

## 3. Product Architecture & File Structure

The current local workspace has no application source files yet. The intended implementation should remain easy to extend from Stitch-generated screens into a production web app.

```text
WashFlow/
├── .stitch/
│   ├── DESIGN.md
│   └── SITE.md
├── site/
│   ├── public/
│   │   ├── index.html
│   │   ├── queue.html
│   │   ├── orders.html
│   │   ├── machines.html
│   │   └── reports.html
│   └── src/                  # future application source
├── queue/                    # Stitch-generated or imported candidates
└── README.md                 # implementation notes and setup
```

**Asset flow:** Stitch generates candidate screens/assets into `queue/` → validate structure, accessibility, and responsive behavior → move approved production assets into `site/public/` or the application asset directory.

**Navigation strategy:** Keep a persistent desktop sidebar with Queue, Orders, Machines, Customers, Reports, and Settings. Preserve the selected ticket context while moving between queue views. On smaller screens, use a drawer or compact top navigation.

## 4. Live Sitemap

### Current Stitch References

- [x] `WashTrack - Hàng đợi công việc` — primary work queue reference screen.
- [x] `WashTrack - Hàng đợi công việc (Đơn nhiều nhóm xử lý độc lập)` — expanded queue and independent processing-group reference.
- [x] `WashTrack - PRD & Project Brief` — product requirements reference stored in Stitch.

### Target Application Pages

- [x] `/` — operational home / current shift overview.
- [x] `/queue` — intake and processing work queue.
- [x] `/orders` — searchable order list and order creation flow.
- [x] `/order-detail` — ticket inspector, garment groups, notes, exceptions, and next action.
- [x] `/machines` — washer/dryer capacity, active cycles, countdowns, and faults.
- [x] `/customers` — customer lookup and order history.
- [x] `/reports` — shift throughput, turnaround time, exceptions, and pickup readiness.
- [x] `/settings` — service types, machines, staff roles, and operational rules.

## 5. Roadmap Backlog

### High Priority

- Build the desktop application shell with persistent navigation and the WashFlow visual tokens.
- Implement the primary queue view with ticket IDs, customer data, status badges, elapsed timers, service type, machine assignment, and next actions.
- Implement ticket selection and a detail inspector that keeps queue context visible.
- Support independent processing groups within one order, including separate status and progression for each group.
- Add core statuses: intake, queued, washing, drying, quality check, ready, hold, and critical issue.
- Add barcode/ticket search and keyboard-friendly queue navigation.

### Medium Priority

- Add order creation with customer, garment groups, service type, weight/count, promised time, and rush handling.
- Add machine status tiles with live progress and remaining-time display.
- Add filters for status, service type, rush orders, machine, promised time, and assigned staff.
- Add notes, quality-control checks, exception reasons, and resolution actions.
- Add customer lookup and order history.
- Add shift dashboard metrics for active orders, ready pickups, overdue work, and machine utilization.

### Low Priority

- Add reports and exportable shift summaries.
- Add configurable service and machine administration.
- Add handheld/mobile floor layout with 44px touch targets.
- Add notification preferences and audit history.
- Add visual polish such as subtle focus transitions, print-ready ticket views, and optional dark mode only if operational testing supports it.

## 6. Operational Interaction Principles

- The next action must be visible without opening a secondary page.
- Status changes should be explicit, reversible where possible, and recorded with actor and timestamp.
- Never rely on color alone: pair every status color with text, iconography, or a machine-readable label.
- Preserve the currently selected ticket when filters, drawers, or queue tabs change.
- Treat rush, hold, contamination, and overdue states as operational exceptions with clear resolution paths.
- Optimize for keyboard use, barcode scanners, and fast repeated actions.
- Prefer compact confirmation patterns over disruptive modal dialogs for routine progression.

## 7. Creative Freedom Guidelines

### Protected Decisions

- Keep the operational queue as the product center of gravity.
- Preserve the cool slate/white foundation and the established semantic state colors.
- Preserve high information density, fixed-width data alignment, and crisp borders.
- Keep the three-pane desktop mental model: navigation, queue, and inspector.

### Flexible Decisions

- Exact icon family, provided icons are simple and legible.
- Whether secondary panels use tabs, segmented controls, or compact sub-navigation.
- Chart types for reports, provided they remain readable and action-oriented.
- Micro-interactions, provided they are short, purposeful, and do not delay scanning.
- Mobile stacking order, provided queue priority and next actions remain obvious.

### Guardrails

- Do not introduce gradients, glassmorphism, oversized hero imagery, or decorative illustrations into core operations.
- Do not use a new color for a state that can use an existing semantic token.
- Do not hide critical queue information behind hover-only interactions.
- Do not trade ticket readability for visual novelty.
- When uncertain, choose the option that is faster to scan, easier to operate with a barcode scanner, and safer during a busy shift.
