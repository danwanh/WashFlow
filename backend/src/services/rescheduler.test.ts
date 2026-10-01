import assert from 'node:assert/strict'
import test from 'node:test'
import {
  computeSchedule,
  earliestFeasiblePickup,
  evaluateOrder,
  lateOrderIds,
  withPickup,
  type ScheduleOrder,
  type ScheduleState,
} from './rescheduler.js'

const MINUTE = 60_000
const now = new Date('2026-01-01T08:00:00.000Z')
const at = (minutes: number) => new Date(now.getTime() + minutes * MINUTE)
const washer = {
  machineId: 1,
  type: 'WASHER',
  status: 'AVAILABLE',
  capacityKg: 10,
  processingMinutes: 30,
}

// One batch: sorting already under way, then a 30-minute wash and 15 minutes of packing.
function order(orderId: number, pickupMinutes: number): ScheduleOrder {
  const stage = (id: number, name: string, start: number, end: number) => ({
    batchStageId: orderId * 10 + id,
    stage: name,
    status: 'PLANNED',
    machineId: name === 'WASH' ? 1 : null,
    plannedStartAt: at(start),
    plannedEndAt: at(end),
    actualStartedAt: name === 'CLASSIFY' ? now : null,
    actualMachineFinishedAt: null,
    actualEndedAt: null,
  })
  return {
    orderId,
    pickupAt: at(pickupMinutes),
    estimatedAt: null,
    priority: 0,
    createdAt: now,
    batches: [
      {
        batchId: orderId,
        weightKg: 5,
        estimatedAt: null,
        stages: [
          stage(1, 'CLASSIFY', 0, 10),
          stage(2, 'WASH', 10, 40),
          stage(3, 'PACKING', 40, 55),
        ],
      },
    ],
  }
}

test('schedules the order with the least slack first on a shared machine', () => {
  const state: ScheduleState = {
    machines: [washer],
    orders: [order(1, 200), order(2, 60)],
  }
  const result = computeSchedule(state, now)
  const eta = (id: number) =>
    new Date(
      result.affectedOrders.find((entry) => entry.orderId === id)!.estimatedAt,
    ).getTime()
  assert.equal(eta(2), at(55).getTime())
  assert.equal(eta(1), at(85).getTime())
  // The snapshot itself is left untouched.
  assert.equal(
    state.orders[0]!.batches[0]!.stages[1]!.plannedStartAt!.getTime(),
    at(10).getTime(),
  )
})

test('never projects an ETA before now for overdue packing', () => {
  const overdue = order(1, 600)
  for (const stage of overdue.batches[0]!.stages) {
    stage.plannedStartAt = new Date(
      stage.plannedStartAt!.getTime() - 120 * MINUTE,
    )
    stage.plannedEndAt = new Date(stage.plannedEndAt!.getTime() - 120 * MINUTE)
    if (stage.stage !== 'PACKING') {
      stage.status = 'COMPLETED'
      stage.actualStartedAt = stage.plannedStartAt
      stage.actualEndedAt = stage.plannedEndAt
    }
  }
  const result = computeSchedule({ machines: [washer], orders: [overdue] }, now)
  assert.equal(result.affectedOrders[0]!.estimatedAt, at(15).toISOString())
})

test('rejects an expedite that makes an on-time order late and suggests the earliest safe pickup', () => {
  const state: ScheduleState = {
    machines: [washer],
    orders: [order(1, 60), order(2, 300)],
  }
  const baselineLate = lateOrderIds(computeSchedule(state, now))
  assert.equal(baselineLate.size, 0)
  // Pulling order 2 ahead of order 1 would push order 1 to 85 minutes, past its 60-minute pickup.
  const expedited = evaluateOrder(
    withPickup(state, 2, at(50)),
    2,
    baselineLate,
    now,
  )
  assert.equal(expedited.feasible, false)
  assert.deepEqual(
    expedited.newlyLate.map((entry) => entry.orderId),
    [1],
  )
  const earliest = earliestFeasiblePickup(state, 2, at(50), baselineLate, now)
  assert.ok(earliest)
  assert.equal(
    evaluateOrder(withPickup(state, 2, earliest), 2, baselineLate, now)
      .feasible,
    true,
  )
  assert.equal(
    evaluateOrder(
      withPickup(state, 2, new Date(earliest.getTime() - MINUTE)),
      2,
      baselineLate,
      now,
    ).feasible,
    false,
  )
  assert.equal(earliest.getTime(), at(85).getTime())
})

test('postponing an order that is already late is feasible once the pickup covers its ETA', () => {
  const state: ScheduleState = { machines: [washer], orders: [order(1, 30)] }
  const baselineLate = lateOrderIds(computeSchedule(state, now))
  assert.deepEqual([...baselineLate], [1])
  assert.equal(
    evaluateOrder(withPickup(state, 1, at(45)), 1, baselineLate, now).feasible,
    false,
  )
  assert.equal(
    evaluateOrder(withPickup(state, 1, at(55)), 1, baselineLate, now).feasible,
    true,
  )
  assert.equal(
    earliestFeasiblePickup(state, 1, at(45), baselineLate, now)?.getTime(),
    at(55).getTime(),
  )
})

test('moves planned work off a machine under maintenance', () => {
  const second = { ...washer, machineId: 2 }
  const state: ScheduleState = {
    machines: [{ ...washer, status: 'MAINTENANCE' }, second],
    orders: [order(1, 200)],
  }
  const result = computeSchedule(state, now)
  const wash = result.stagePlans.find((plan) => plan.batchStageId === 12)
  assert.equal(wash?.machineId, 2)
  assert.deepEqual(result.unscheduledStageIds, [])
})

test('leaves a stage unassigned and the order at risk when no machine can run it', () => {
  const state: ScheduleState = {
    machines: [{ ...washer, status: 'MAINTENANCE' }],
    orders: [order(1, 600)],
  }
  const result = computeSchedule(state, now)
  assert.deepEqual(result.unscheduledStageIds, [12])
  assert.equal(result.stagePlans.find((plan) => plan.batchStageId === 12)?.machineId, null)
  assert.equal(result.affectedOrders[0]!.late, true)
})
