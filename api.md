# WashFlow API

Proposed HTTP API contract for the single-store laundry workflow. The current
backend is only a scaffold, so these endpoints describe the domain contract and
are not yet implemented.

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

Every batch has the stages `CLASSIFY` (sorting), then `WASH` and/or `DRY`
depending on the service, then `PACKING`. `CLASSIFY` and `PACKING` are manual
stages with no machine (`machine_id: null`). `CLASSIFY` starts when the order
is confirmed.

Stage statuses: `PLANNED`, `IN_PROGRESS`, `MACHINE_FINISHED`, `COMPLETED`.
Manual stages go straight from `PLANNED` to `COMPLETED`.

### Stage timing

Queue tasks (`GET /api/queue`) and every stage in the order resource carry
timing fields computed by `backend/src/services/timing.ts`: `phase`
(`PLANNED`, `RUNNING`, `WAITING_UNLOAD`, `DONE`), `timing_status` (`ON_TIME`,
`APPROACHING`, `LATE`, `COMPLETED_ON_TIME`, `COMPLETED_LATE`),
`expected_start_at`, `expected_end_at`, `waiting_since`, `late_at`,
`approaching_at`, `delay_minutes`, `remaining_minutes`, and a Vietnamese
`timing_label`. Only a batch's next unfinished stage is measured:

| Stage | Late when |
|---|---|
| `PLANNED` `WASH`/`DRY` | `planned_start_at` has passed |
| `PLANNED` `CLASSIFY`/`PACKING` | `planned_end_at` has passed |
| `IN_PROGRESS` | `actual_started_at` + planned length has passed |
| `MACHINE_FINISHED` | waiting longer than `ALERT_UNLOAD_THRESHOLD_MINUTES` (15) |
| `COMPLETED` | `actual_ended_at` was after `planned_end_at` |

Queue tasks also carry `order_late_minutes` (how far the ETA, or now once the
pickup time has passed, is beyond the pickup time).

### Machine types and statuses

- Types: `WASHER`, `DRYER`
- Statuses: `AVAILABLE`, `BUSY`, `OFFLINE`, `MAINTENANCE`

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
  "special_note": null
}
```

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

`batches[]` contains the proposed `weight_kg`, `batch_no`, `batch_items[]`,
and `stages[]`. Each stage includes `stage`, `machine_id`,
`planned_start_at`, and `planned_end_at`.

If the requested pickup cannot be met, return `200` with `feasible: false` and
the earliest feasible pickup, or `422` when no feasible schedule exists at all.
The failed trial must not alter the committed schedule.

Planning rules:

- Items are grouped using the configured compatibility matrix and processing
  requirements, never by weight alone.
- Batch generation uses modified Best Fit Decreasing with machine capacity
  checks.
- `WASH_DRY` requires a feasible washer and dryer for every batch.
- Pending stages are prioritized by least slack time, then manual priority,
  waiting time, pickup time, and creation time.
- A plan is rejected if it makes an already accepted order late.

### Confirm a plan

`POST /api/orders`

Persists the accepted plan returned by `/orders/plan`.

Request:

```json
{
  "plan_id": "opaque-trial-plan-token"
}
```

The server revalidates the plan against current machine availability and the
current schedule. On success it persists the customer, order, items, batches,
batch items, and stages in one transaction, and sets the order status to
`RECEIVED`.

Response: `201 Created` with the complete order resource.

The plan is rejected with `409` if it is expired, already confirmed, or no
longer matches the committed schedule.

## Orders

### List orders

`GET /api/orders`

Optional query parameters:

- `status`
- `pickup_from`, `pickup_to`
- `priority`
- `page`, `page_size`

The response includes order summary fields, current ETA, pickup time, and
active alert count. Default ordering should prioritize operational urgency,
not creation time alone.

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
  "reason": "Customer requested later pickup"
}
```

The server clones the current schedule, locks `IN_PROGRESS` stages, trial-
reschedules pending stages, and validates all accepted deadlines before
updating the real `pickup_at`. On success it records
`APPOINTMENT_HISTORY` and returns the updated order and schedule.

If infeasible, return `422` with the original order unchanged, the reason,
affected orders, and the earliest feasible pickup when available.

### Recalculate schedule

`POST /api/orders/:orderId/reschedule`

Use after a relevant event such as a batch composition change, machine failure,
machine return, material stage timing change, or manual assignment change.
The operation locks `IN_PROGRESS` stages and may change only not-started
(`PLANNED`) assignments.

Request:

```json
{
  "reason": "MACHINE_FAILURE",
  "machine_id": 3
}
```

## Physical Workflow

All batch work goes through the stage endpoints below; each returns the order
resource. After every transition the order status is derived from its stages:

| Condition | Order status |
|---|---|
| Some `CLASSIFY` stage not completed | `RECEIVED` |
| All `CLASSIFY` completed, machine stages remain | `WAITING` (sets `classified_at`) |
| Only `PACKING` stages remain | `FOLDING_PACKING` |
| Every stage completed | `READY` (sets `packing_completed_at`, `ready_at`) |

A stage can only be acted on once every earlier stage of its batch is
`COMPLETED` (`400 INVALID_STATE` otherwise).

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
  sufficient capacity (`409 MACHINE_UNAVAILABLE` otherwise).

On success, the stage becomes `IN_PROGRESS`, `actual_started_at` is set, the
batch becomes `WASHING` or `DRYING`, and the machine becomes `BUSY`. The
assignment is locked and non-preemptive.

### Mark machine cycle finished / complete sorting or packing

`POST /api/batches/:batchId/stages/:stageId/machine-finished`

For an `IN_PROGRESS` `WASH`/`DRY` stage: sets `actual_machine_finished_at`,
changes the stage to `MACHINE_FINISHED`, and changes the batch to
`WAITING_FOR_UNLOAD`. The machine remains `BUSY` until unload is confirmed.

For a `PLANNED` `CLASSIFY` or `PACKING` stage: completes it
(`actual_ended_at` = now). The batch moves to `WAITING` on its next stage, or
to `COMPLETED` after `PACKING`. All open orders are then rescheduled.

### Confirm unload

`POST /api/batches/:batchId/stages/:stageId/unload`

Sets `actual_ended_at`, changes the stage to `COMPLETED`, and makes the machine
`AVAILABLE`. The batch moves to `WAITING` on its next stage (`DRY` or
`PACKING`). All open orders are then rescheduled.

## Notifications

### Create notification draft

`POST /api/orders/:orderId/notifications/draft`

Allowed only when the order is `READY`. Returns an editable notification draft
without completing the order.

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
`completed_at`, and change the order from `READY` to `COMPLETED`. On failure,
create a `FAILED` notification and leave the order `READY`.

There is no `NOTIFIED` order status and no customer-pickup completion
operation.

## Machines

### List machines

`GET /api/machines`

Returns machine type, status, capacity, processing duration, and update time.

### Update machine status

`PATCH /api/machines/:machineId`

Request:

```json
{
  "status": "MAINTENANCE"
}
```

Changing operational availability is a scheduling event. It must trigger
rescheduling of eligible not-started stages while preserving locked stages.

## Alerts

### List alerts

`GET /api/alerts`

Optional filters: `status`, `severity`, `type`, `order_id`, and `batch_id`.

Alerts are separate from order statuses. Supported system-generated conditions
include `LATE_RISK` and forgotten work for long-waiting batches, unloads,
folding/packing, or ready orders whose final notification has not succeeded.

### Snooze an alert

`POST /api/alerts/:alertId/snooze`

Sets `snoozed_until` to five minutes from the current time unless a different
configured policy is introduced.

### Resolve an alert

`POST /api/alerts/:alertId/resolve`

Sets `resolved_at` and marks the alert resolved. A condition that remains true
must be eligible to reappear after snoozing.

## Resource Shapes

### Order

```json
{
  "order_id": 101,
  "customer_id": 7,
  "service_type": "WASH_DRY",
  "status": "WAITING",
  "total_weight_kg": 4.2,
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
  "alerts": []
}
```

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
      "planned_start_at": "2026-09-10T13:00:00Z",
      "planned_end_at": "2026-09-10T14:00:00Z",
      "actual_started_at": "2026-09-10T13:02:00Z",
      "actual_machine_finished_at": null,
      "actual_ended_at": null
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
5. Only `PLANNED` stages may be reassigned; `IN_PROGRESS` stages are locked.
6. A machine cycle does not free a machine until unload confirmation.
7. Order ETA is the latest end of a batch's `PACKING` stage, not summed duration.
8. Trial plans do not mutate committed data until confirmed.
9. `READY` requires every batch stage, including `PACKING`, to be complete.
10. A failed final notification leaves the order in `READY`.
11. Alerts are not order statuses.
12. Rescheduling is event-driven, not continuous.
