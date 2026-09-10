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

### Stage statuses

`PLANNED`, `IN_PROGRESS`, `MACHINE_FINISHED`, `COMPLETED`

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

### Confirm classification

`POST /api/orders/:orderId/classification`

Confirms the proposed physical batches:

```json
{
  "batches": [
    {
      "batch_id": 12,
      "items": [
        { "order_item_id": 44, "weight_kg": 2.4 }
      ]
    }
  ]
}
```

If composition changes, the server validates exact `BATCH_ITEMS` weight
allocation, reschedules not-started stages, recalculates ETA, and reruns late-
risk checks. On confirmation, batches move to `WAITING` and the order remains
in its appropriate aggregate state.

### Start a machine stage

`POST /api/batches/:batchId/stages/:stageId/start`

Request:

```json
{
  "machine_id": 3
}
```

Preconditions:

- The batch is `WAITING`.
- The stage is `PLANNED`.
- The machine type matches the stage.
- The machine is operational and has sufficient capacity.

On success, the stage becomes `IN_PROGRESS`, `actual_started_at` is set, the
batch becomes `WASHING` or `DRYING`, and the machine becomes `BUSY`. The
assignment is locked and non-preemptive.

### Mark machine cycle finished

`POST /api/batches/:batchId/stages/:stageId/machine-finished`

Sets `actual_machine_finished_at`, changes the stage to `MACHINE_FINISHED`, and
changes the batch to `WAITING_FOR_UNLOAD`. The machine remains `BUSY` until
unload is confirmed.

### Confirm unload

`POST /api/batches/:batchId/stages/:stageId/unload`

Sets `actual_ended_at`, changes the stage to `COMPLETED`, and makes the machine
`AVAILABLE`. The batch becomes `WAITING` if another machine stage remains, or
`COMPLETED` otherwise. This event may trigger rescheduling.

### Confirm packing

`POST /api/orders/:orderId/packing`

No request body is required. All batches must be machine-complete. The server
sets `packing_completed_at` and `ready_at`, then changes the order to `READY`.

It must reject the request while any batch has unfinished machine work.

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
7. Multi-batch ETA is the latest batch ETA plus packing time, not summed duration.
8. Trial plans do not mutate committed data until confirmed.
9. `READY` requires all machine work and packing to be complete.
10. A failed final notification leaves the order in `READY`.
11. Alerts are not order statuses.
12. Rescheduling is event-driven, not continuous.
