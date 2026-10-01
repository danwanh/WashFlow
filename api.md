# WashFlow API

HTTP API of the single-store laundry workflow, as implemented in `backend/`
(routes in `backend/src/routes/`, handlers in `backend/src/controllers/`).

## Conventions

- Base path: `/api`
- JSON request and response bodies
- Timestamps use ISO 8601 UTC strings, for example `2026-09-10T08:30:00Z`.
- Weights are decimal kilograms.
- IDs are integer database identifiers.
- There is currently no authentication, staff management, or store management.

Successful responses use the resource directly unless an operation returns a
plan or result object. Errors use this shape:

```json
{
  "error": {
    "code": "PICKUP_UNFEASIBLE",
    "message": "No valid schedule meets the requested pickup time.",
    "details": {}
  }
}
```

Common status codes:

| Code | Meaning |
|---|---|
| `400` | Invalid input or invalid state transition |
| `404` | Resource does not exist |
| `409` | Conflicting schedule, machine assignment, or stale plan |
| `422` | Valid input but no feasible plan |
| `500` | Unexpected server error |

## Enumerations

### Services

`WASH`, `DRY`, `WASH_DRY`

### Order statuses

`RECEIVED`, `WAITING`, `FOLDING_PACKING`, `READY`, `COMPLETED`

`WAITING` represents the aggregate state while batches are waiting or machine
processing is underway. It is not a replacement for the individual batch and
stage statuses.

### Batch statuses

`WAITING`, `WASHING`, `DRYING`, `WAITING_FOR_UNLOAD`, `COMPLETED`

### Stages

Every batch has the stages `CLASSIFY`, then `WASH` and/or `DRY` depending on the
service, then `PACKING`. `CLASSIFY` and `PACKING` are manual stages with no
machine (`machine_id` is `0` in plans and `null` once persisted).

Stage statuses: `PLANNED`, `IN_PROGRESS`, `MACHINE_FINISHED`, `COMPLETED`.
Manual stages go straight from `PLANNED` to `COMPLETED`.

### Machine types and statuses

- Types: `WASHER`, `DRYER`
- Statuses: `AVAILABLE`, `BUSY`, `OFFLINE`, `MAINTENANCE`

### Alerts

- Types: `LATE_RISK`, `STAGE_LATE`, `STAGE_APPROACHING`, `MACHINE_FINISHED`,
  `FORGOTTEN_WAITING`, `FORGOTTEN_UNLOAD`, `FORGOTTEN_PACKING`,
  `FORGOTTEN_NOTIFICATION`
- Severities: `INFO`, `WARNING`, `CRITICAL`
- Statuses: `OPEN`, `SNOOZED`, `RESOLVED`

## Order Planning

### Preview a plan

`POST /api/orders/plan`

Builds compatibility groups, generates batches, trial-schedules the stages,
calculates ETA, and validates the requested pickup time. This operation must not
persist an order, batch, batch item, or stage.

Request:

```json
{
  "customer": {
    "name": "Nguyen Van A",
    "phone": "0900000000"
  },
  "service_type": "WASH_DRY",
  "items": [
    {
      "item_type": "shirt",
      "quantity": 5,
      "weight_kg": 1.8,
      "note": "White shirts"
    }
  ],
  "pickup_at": "2026-09-10T16:00:00Z",
  "priority": 0,
  "total_amount": 180000,
  "special_note": null
}
```

`priority`, `total_amount`, and `special_note` are optional. When
`total_amount` is omitted it is computed on confirmation from the total weight
(per kg: `WASH` 25000, `DRY` 20000, `WASH_DRY` 40000).

`item_type` is mapped to a compatibility group by a fixed table in
`services/planner.ts` (`shirt`, `white`, `light`, `color`, `dark`, `black`,
`towel`, `blanket`, `jeans`, `sport`, `delicate`, `special`); unknown types are
treated as `SPECIAL`.

Response when feasible:

```json
{
  "plan_id": "opaque-trial-plan-token",
  "feasible": true,
  "estimated_at": "2026-09-10T15:10:00Z",
  "pickup_at": "2026-09-10T16:00:00Z",
  "deadline_buffer_minutes": 50,
  "customer": {
    "name": "Nguyen Van A",
    "phone": "0900000000"
  },
  "items": [],
  "compatibility_groups": [],
  "batches": [],
  "affected_orders": [],
  "warnings": []
}
```

Plan internals are returned in camelCase: each `batches[]` entry is
`{ batchNo, weightKg, group, items: [{ itemIndex, weightKg }], stages: [{ stage,
machineId, plannedStartAt, plannedEndAt }] }`, and `compatibility_groups[]` is
`{ group, itemIndices, totalWeightKg }`. `affected_orders` is always empty.

The plan is always returned with `200`. If the requested pickup cannot be met,
`feasible` is `false`, `estimated_at` is the earliest feasible pickup, and
`warnings` contains `PICKUP_TOO_EARLY`. If no machine can take the laundry,
`feasible` is `false`, `batches` is empty, and `warnings` contains
`NO_FEASIBLE_MACHINE`. Items heavier than the largest usable machine are split
across batches.

The plan is kept in server memory for 10 minutes under `plan_id` and is lost on
restart.

Planning rules:

- Items are grouped using the configured compatibility matrix and processing
  requirements, never by weight alone.
- Batch generation uses modified Best Fit Decreasing with machine capacity
  checks.
- `WASH_DRY` requires a feasible washer and dryer for every batch.
- The planner only sees existing work through each machine's next free time;
  it does not re-check other orders' deadlines. Those orders are re-planned by
  the reschedule that runs after confirmation.

### Confirm a plan

`POST /api/orders`

Persists the accepted plan returned by `/orders/plan`.

Request:

```json
{
  "plan_id": "opaque-trial-plan-token"
}
```

On success the server persists the customer, order, items, batches, batch
items, and stages in one transaction, sets the order status to `RECEIVED`,
starts every `CLASSIFY` stage (`actual_started_at` = now), and then reschedules
all open orders (`NEW_ORDER`).

Response: `201 Created` with the complete order resource.

Errors: `409 STALE_PLAN` if the plan is unknown, expired, or already
confirmed; `422 PICKUP_UNFEASIBLE` if the plan was not feasible.

## Orders

### List orders

`GET /api/orders`

Optional query parameters:

- `status`
- `pickup_from`, `pickup_to`
- `priority`
- `page` (default 1), `page_size` (default 25)

Returns an array of summaries: `order_id`, `customer`, `service_type`,
`status`, `total_weight_kg`, `total_amount`, `pickup_at`, `estimated_at`,
`priority`, `active_alert_count`, and `batches` (batch count). Ordered by
priority (highest first), then pickup time.

### Get an order

`GET /api/orders/:orderId`

Returns the order with its customer, items, batches, batch item allocations,
stages, appointment history, notifications, and alerts.

### Change pickup time

`POST /api/orders/:orderId/pickup-change`

Request:

```json
{
  "new_pickup_at": "2026-09-10T18:00:00Z",
  "reason": "Customer requested later pickup",
  "preview": false
}
```

Inside one transaction the server updates `pickup_at` and reschedules every open
order. The change is rejected if a stage cannot be scheduled, if this order
becomes late, or if another order that was on time becomes late; orders that
were already late do not block it. On success it records
`APPOINTMENT_HISTORY` and returns `{ order, schedule }`.

If infeasible, the transaction is rolled back and the server returns
`422 PICKUP_UNFEASIBLE` with `details.earliest_feasible_pickup`,
`details.affected_orders`, and `details.unscheduled_stage_ids`.

With `"preview": true` nothing is saved. The server returns `200` with
`feasible`, `affected_orders[]` (`order_id`, `relation`: `changing` |
`same_group` | `affected`, `customer`, `pickup_at`, `estimated_at`, `late`,
`preexisting_late`), `unscheduled_stage_ids`, and `earliest_feasible_pickup`.
A new pickup equal to the current one is rejected with `400`.

### Recalculate schedule

`POST /api/orders/:orderId/reschedule`

Reschedules all open orders, not just this one. `IN_PROGRESS` and
`MACHINE_FINISHED` stages are locked; only `PLANNED` stages may change machine or
time. Returns `order`, `reason`, `locked_stage_ids` (this order's in-progress
stages), `schedule`, `affected_orders`, and `changed_stage_ids`.

Request:

```json
{
  "reason": "MACHINE_FAILURE",
  "machine_id": 3
}
```

## Physical Workflow

All batch work goes through the stage endpoints below. Each one returns the
full order resource. After every stage transition the order status is
recalculated from its stages:

| Condition | Order status |
|---|---|
| Some `CLASSIFY` stage not completed | `RECEIVED` |
| All `CLASSIFY` completed, machine stages remain | `WAITING` (sets `classified_at`) |
| Only `PACKING` stages remain | `FOLDING_PACKING` |
| Every stage completed | `READY` (sets `packing_completed_at`, `ready_at`) |

### Start a machine stage

`POST /api/batches/:batchId/stages/:stageId/start`

Request (optional; defaults to the planned machine):

```json
{
  "machine_id": 3
}
```

Preconditions:

- The batch is `WAITING`.
- The stage is a `PLANNED` `WASH` or `DRY` stage.
- The machine type matches the stage, the machine is `AVAILABLE`, and it has
  enough capacity. Otherwise `409 MACHINE_UNAVAILABLE`.

On success, the stage becomes `IN_PROGRESS`, `actual_started_at` is set, the
batch becomes `WASHING` or `DRYING`, and the machine becomes `BUSY`. The
assignment is locked and non-preemptive.

### Mark machine cycle finished / complete a manual stage

`POST /api/batches/:batchId/stages/:stageId/machine-finished`

For a `WASH`/`DRY` stage that is `IN_PROGRESS`: sets
`actual_machine_finished_at`, changes the stage to `MACHINE_FINISHED`, changes
the batch to `WAITING_FOR_UNLOAD`, and opens a `MACHINE_FINISHED` alert. The
machine remains `BUSY` until unload is confirmed.

For a `PLANNED` `CLASSIFY` or `PACKING` stage: completes the stage
(`actual_ended_at` = now). The batch becomes `WAITING` on its next stage, or
`COMPLETED` after `PACKING`. Then all open orders are rescheduled.

### Confirm unload

`POST /api/batches/:batchId/stages/:stageId/unload`

Sets `actual_ended_at`, changes the stage to `COMPLETED`, makes the machine
`AVAILABLE`, resolves the `MACHINE_FINISHED` alert, and moves the batch to
`WAITING` on its next stage (`DRY` or `PACKING`). Then all open orders are
rescheduled (`STAGE_UNLOADED`).

## Notifications

### Create notification draft

`POST /api/orders/:orderId/notifications/draft`

Allowed only when the order is `READY`. Returns an editable
`{ type, channel, content }` draft without completing the order.

### Send notification

`POST /api/orders/:orderId/notifications`

Request:

```json
{
  "type": "READY_FOR_PICKUP",
  "channel": "SMS",
  "content": "Your laundry order is ready for pickup."
}
```

On successful delivery, create a `SENT` notification with `sent_at`, set
`completed_at`, change the order from `READY` to `COMPLETED`, and return the
order. On failure, create a `FAILED` notification, leave the order `READY`, and
return `502 NOTIFICATION_FAILED` with the order in `details`.

No real delivery channel is wired up: every send succeeds except when
`content` is exactly `__FAIL__`, which simulates a failure.

There is no `NOTIFIED` order status and no customer-pickup completion
operation.

## Machines

### List machines

`GET /api/machines`

Returns `machine_id`, `name`, `type`, `status`, `capacity_kg`,
`processing_minutes`, `updated_at`, and `active_stage` (the stage currently
`IN_PROGRESS` or `MACHINE_FINISHED` on the machine, with its order and customer,
or `null`).

### Update machine status

`PATCH /api/machines/:machineId`

Request:

```json
{
  "status": "MAINTENANCE"
}
```

Any status change reschedules all open orders (`MACHINE_RETURNED` when the new
status is `AVAILABLE`, otherwise `MACHINE_FAILURE`), keeping locked stages.

## Alerts

### List alerts

`GET /api/alerts`

Optional filters: `status` (a value or a comma-separated list; without it,
resolved alerts are left out), `severity`, `type`, `order_id`, and `batch_id`.
Newest first.

Alerts are separate from order statuses. `LATE_RISK` is created by every
reschedule when an order's ETA passes its pickup time. `MACHINE_FINISHED` is
opened and resolved by the stage endpoints. The rest are created by a scan.

### Scan alerts

`POST /api/alerts/scan`

Opens, refreshes, or resolves alerts for all open orders and returns
`{ scannedAt, changed }`. Nothing runs on a timer, so the client calls this
endpoint. Thresholds in minutes come from environment variables:

| Alert | Condition | Threshold env (default) |
|---|---|---|
| `LATE_RISK` | ETA after pickup | — |
| `STAGE_LATE` / `STAGE_APPROACHING` | Unfinished stage past / within 5 min of `planned_end_at` | — |
| `FORGOTTEN_WAITING` | Batch `WAITING` for a `WASH`/`DRY` stage too long | `ALERT_WAITING_THRESHOLD_MINUTES` (30) |
| `FORGOTTEN_UNLOAD` | Batch `WAITING_FOR_UNLOAD` too long | `ALERT_UNLOAD_THRESHOLD_MINUTES` (15) |
| `FORGOTTEN_PACKING` | Order `FOLDING_PACKING` too long after the last unload | `ALERT_PACKING_THRESHOLD_MINUTES` (30) |
| `FORGOTTEN_NOTIFICATION` | Order `READY` with no successful notification | `ALERT_READY_THRESHOLD_MINUTES` (30) |

A snoozed alert whose condition still holds goes back to `OPEN` once
`snoozed_until` has passed.

### Snooze an alert

`POST /api/alerts/:alertId/snooze`

Sets the status to `SNOOZED` and `snoozed_until` to five minutes from now.

### Resolve an alert

`POST /api/alerts/:alertId/resolve`

Sets `resolved_at` and marks the alert `RESOLVED`. If the condition still
holds, the next scan opens a new alert.

## Queue

### Get the work queue

`GET /api/queue`

Returns `{ now, count, tasks, machines }` for every order that is not
`COMPLETED`. Each batch contributes one task: its next unfinished stage.
`action_type` is `CLASSIFY`, `START`, `MACHINE_FINISHED`, `UNLOAD`, or
`PACK`. A `READY` order contributes one order-level `NOTIFY` task
(`batch_id: null`). Action and detail labels are in Vietnamese.

Tasks are sorted by `slack_minutes` (pickup time minus now minus the remaining
planned machine time), then priority (highest first), pickup time, and order
id. `rank` is the position in that order. Machine-stage tasks include timing
fields: `timing_status` (`ON_TIME`, `APPROACHING`, `LATE`,
`COMPLETED_ON_TIME`, `COMPLETED_LATE`), `delay_minutes`, `remaining_minutes`,
and `timing_label`. `STAGE_APPROACHING_THRESHOLD_MINUTES` (default 5) sets when
a stage counts as approaching.

`machines[]` lists every machine with its `active_task`.

## Overview

### Get dashboard metrics

`GET /api/overview?from=YYYY-MM-DD&to=YYYY-MM-DD`

Both dates default to today (UTC), and the range may be at most 366 days.
Covers orders whose pickup time falls in the range. Returns `kpis` (`revenue`,
`orderCount`, `processingCount`, `onTimeCount`, `lateCount`),
`revenueByHour`, `appointmentStatus`, `pickupPeaks`, and `ordersByDay`.

## Resource Shapes

### Order

```json
{
  "order_id": 101,
  "customer_id": 7,
  "service_type": "WASH_DRY",
  "status": "WAITING",
  "total_weight_kg": 4.2,
  "total_amount": 168000,
  "pickup_at": "2026-09-10T16:00:00Z",
  "estimated_at": "2026-09-10T15:10:00Z",
  "priority": 0,
  "special_note": null,
  "classified_at": null,
  "packing_completed_at": null,
  "ready_at": null,
  "completed_at": null,
  "created_at": "2026-09-10T08:00:00Z",
  "updated_at": "2026-09-10T09:00:00Z",
  "customer": {},
  "items": [],
  "batches": [],
  "appointments": [],
  "notifications": [],
  "alerts": []
}
```

The order resource also still carries the raw camelCase Prisma fields next to
the snake_case ones. `alerts` holds only alerts that are not resolved.

### Batch and stage

Every batch response includes exact item allocations. A single order item may
be split across batches, and a batch may contain multiple compatible order
items.

```json
{
  "batch_id": 12,
  "order_id": 101,
  "batch_no": 1,
  "weight_kg": 4.2,
  "status": "WASHING",
  "current_stage": "WASH",
  "estimated_at": "2026-09-10T15:10:00Z",
  "completed_at": null,
  "batch_items": [],
  "stages": [
    {
      "batch_stage_id": 31,
      "stage": "WASH",
      "status": "IN_PROGRESS",
      "machine_id": 3,
      "machine_name": "Máy giặt 1",
      "planned_start_at": "2026-09-10T13:00:00Z",
      "planned_end_at": "2026-09-10T14:00:00Z",
      "actual_started_at": "2026-09-10T13:02:00Z",
      "actual_machine_finished_at": null,
      "actual_ended_at": null,
      "timing_status": "ON_TIME",
      "delay_minutes": 0,
      "remaining_minutes": 18,
      "timing_label": "Còn 18 phút"
    }
  ]
}
```

## Invariants

Implementations must preserve these rules:

1. Never merge incompatible laundry or exceed machine capacity.
2. `BATCH_ITEMS` must preserve exact weight allocation.
3. `WASH_DRY` requires both machine stages.
4. Existing accepted deadlines must remain protected during planning.
5. Only `PLANNED` stages may be reassigned; `IN_PROGRESS` and
   `MACHINE_FINISHED` stages are locked.
6. A machine cycle does not free a machine until unload confirmation.
7. Order ETA is the latest batch `PACKING` end, not summed duration.
8. Trial plans do not mutate committed data until confirmed.
9. `READY` requires every batch stage, including `PACKING`, to be complete.
10. A failed final notification leaves the order in `READY`.
11. Alerts are not order statuses.
12. Rescheduling is event-driven, not continuous.
