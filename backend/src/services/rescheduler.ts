import { prisma } from './api.js'
import type { Prisma } from '../../generated/prisma/client.js'
import {
  isManualStage,
  remainingWorkMs,
  stageRank,
  timingThresholds,
} from './timing.js'

type Reason = string
const MINUTE = 60_000
const stageOrder = stageRank
const manualMinutes = (stage: string) =>
  Number(
    stage === 'CLASSIFY'
      ? (process.env.CLASSIFY_OFFSET_MINUTES ?? 10)
      : (process.env.PACKING_OFFSET_MINUTES ?? 15),
  ) * MINUTE
const operational = (status: string) => status !== 'MAINTENANCE'
const byWorkflow = <T extends { stage: string }>(stages: T[]) =>
  [...stages].sort((a, b) => stageOrder(a.stage) - stageOrder(b.stage))

// The scheduler works on this plain snapshot, so trial schedules (a new order, another
// pickup time) can be computed in memory as often as needed and only the chosen one is written.
export type ScheduleStage = {
  batchStageId: number
  stage: string
  status: string
  machineId: number | null
  plannedStartAt: Date | null
  plannedEndAt: Date | null
  actualStartedAt: Date | null
  actualMachineFinishedAt: Date | null
  actualEndedAt: Date | null
}
export type ScheduleBatch = {
  batchId: number
  weightKg: number
  estimatedAt: Date | null
  stages: ScheduleStage[]
}
export type ScheduleOrder = {
  orderId: number
  pickupAt: Date
  estimatedAt: Date | null
  priority: number
  createdAt: Date
  batches: ScheduleBatch[]
}
export type ScheduleMachine = {
  machineId: number
  type: string
  status: string
  capacityKg: number
  processingMinutes: number
}
export type ScheduleState = {
  orders: ScheduleOrder[]
  machines: ScheduleMachine[]
}
export type ScheduleResult = ReturnType<typeof computeSchedule>

type Client = Pick<Prisma.TransactionClient, 'laundryOrder' | 'machine'>

export async function loadScheduleState(
  client: Client = prisma,
): Promise<ScheduleState> {
  const [orders, machines] = await Promise.all([
    client.laundryOrder.findMany({
      where: { status: { not: 'COMPLETED' } },
      include: { batches: { include: { stages: true } } },
    }),
    client.machine.findMany(),
  ])
  return {
    orders: orders.map((order) => ({
      orderId: order.orderId,
      pickupAt: order.pickupAt,
      estimatedAt: order.estimatedAt,
      priority: order.priority,
      createdAt: order.createdAt,
      batches: order.batches.map((batch) => ({
        batchId: batch.batchId,
        weightKg: Number(batch.weightKg),
        estimatedAt: batch.estimatedAt,
        stages: batch.stages.map((stage) => ({
          batchStageId: stage.batchStageId,
          stage: stage.stage,
          status: stage.status,
          machineId: stage.machineId,
          plannedStartAt: stage.plannedStartAt,
          plannedEndAt: stage.plannedEndAt,
          actualStartedAt: stage.actualStartedAt,
          actualMachineFinishedAt: stage.actualMachineFinishedAt,
          actualEndedAt: stage.actualEndedAt,
        })),
      })),
    })),
    machines: machines.map((machine) => ({
      machineId: machine.machineId,
      type: machine.type,
      status: machine.status,
      capacityKg: Number(machine.capacityKg),
      processingMinutes: machine.processingMinutes,
    })),
  }
}

const cloneState = (state: ScheduleState): ScheduleState => ({
  machines: state.machines,
  orders: state.orders.map((order) => ({
    ...order,
    batches: order.batches.map((batch) => ({
      ...batch,
      stages: batch.stages.map((stage) => ({ ...stage })),
    })),
  })),
})

// When a batch is realistically done: every unfinished stage is pushed past now and past the
// stage before it, so overdue sorting/packing never yields an ETA in the past.
function projectedEnd(stages: ScheduleStage[], now: number) {
  let cursor = now
  for (const stage of byWorkflow(stages)) {
    const duration =
      stage.plannedStartAt && stage.plannedEndAt
        ? Math.max(
            0,
            stage.plannedEndAt.getTime() - stage.plannedStartAt.getTime(),
          )
        : 0
    if (stage.status === 'COMPLETED') {
      cursor =
        stage.actualEndedAt?.getTime() ??
        stage.plannedEndAt?.getTime() ??
        cursor
    } else if (stage.status === 'MACHINE_FINISHED') {
      cursor = Math.max(now, cursor)
    } else if (stage.status === 'IN_PROGRESS' || stage.actualStartedAt) {
      const started =
        stage.actualStartedAt?.getTime() ??
        stage.plannedStartAt?.getTime() ??
        now
      cursor = Math.max(now, cursor, started + duration)
    } else {
      const start = Math.max(
        now,
        cursor,
        stage.plannedStartAt?.getTime() ?? now,
      )
      cursor = start + duration
    }
  }
  return cursor
}

// Pure: re-plans every PLANNED stage of the snapshot (which it does not modify).
export function computeSchedule(source: ScheduleState, now: Date) {
  const state = cloneState(source)
  const { orders, machines } = state
  const nowMs = now.getTime()
  const unloadMs = timingThresholds().unloadThresholdMinutes * MINUTE
  const availability = new Map(
    machines.map((machine) => [
      machine.machineId,
      machine.status === 'BUSY' ? Number.POSITIVE_INFINITY : nowMs,
    ]),
  )
  const lockedStageIds: number[] = []
  const changedStageIds: number[] = []
  const changedOrderIds = new Set<number>()
  const unscheduledStageIds: number[] = []
  const unscheduledOrderIds = new Set<number>()
  const stagePlans: Array<{
    batchStageId: number
    machineId: number | null
    plannedStartAt: Date
    plannedEndAt: Date
  }> = []

  for (const order of orders) {
    for (const batch of order.batches) {
      for (const stage of byWorkflow(batch.stages)) {
        if (
          stage.status === 'IN_PROGRESS' ||
          stage.status === 'MACHINE_FINISHED'
        ) {
          lockedStageIds.push(stage.batchStageId)
          if (stage.machineId) {
            // A running machine frees up at its planned end (set when it started); a finished
            // one is expected to be unloaded within the unload threshold. Never in the past.
            const freeAt =
              stage.status === 'MACHINE_FINISHED'
                ? (stage.actualMachineFinishedAt?.getTime() ?? nowMs) + unloadMs
                : (stage.plannedEndAt?.getTime() ?? Number.POSITIVE_INFINITY)
            availability.set(stage.machineId, Math.max(nowMs, freeAt))
          }
        } else if (stage.status === 'COMPLETED' && stage.machineId) {
          availability.set(
            stage.machineId,
            Math.max(
              availability.get(stage.machineId) ?? nowMs,
              stage.actualEndedAt?.getTime() ??
                stage.plannedEndAt?.getTime() ??
                nowMs,
            ),
          )
        }
      }
    }
  }

  const scheduled = new Set<number>()
  const pending = orders.flatMap((order) =>
    order.batches.flatMap((batch) =>
      byWorkflow(batch.stages)
        .filter((stage) => stage.status === 'PLANNED')
        .map((stage) => ({ order, batch, stage })),
    ),
  )

  while (pending.length) {
    const eligible = pending.filter(({ batch, stage }) => {
      const stages = byWorkflow(batch.stages)
      const index = stages.findIndex(
        (item) => item.batchStageId === stage.batchStageId,
      )
      const previous = index > 0 ? stages[index - 1]! : undefined
      return (
        !previous ||
        previous.status === 'COMPLETED' ||
        previous.status === 'IN_PROGRESS' ||
        previous.status === 'MACHINE_FINISHED' ||
        scheduled.has(previous.batchStageId)
      )
    })
    if (!eligible.length) break
    eligible.sort((a, b) => {
      // Same slack as the work queue: pickup minus now minus the batch's remaining work.
      const slack = (entry: typeof a) => {
        const stages = byWorkflow(entry.batch.stages)
        const from = stages.findIndex(
          (item) => item.batchStageId === entry.stage.batchStageId,
        )
        return (
          entry.order.pickupAt.getTime() -
          nowMs -
          remainingWorkMs(stages, from, nowMs)
        )
      }
      return (
        slack(a) - slack(b) ||
        b.order.priority - a.order.priority ||
        a.order.pickupAt.getTime() - b.order.pickupAt.getTime() ||
        a.order.createdAt.getTime() - b.order.createdAt.getTime()
      )
    })
    const selected = eligible[0]!
    pending.splice(pending.indexOf(selected), 1)
    const stageType = selected.stage.stage === 'WASH' ? 'WASHER' : 'DRYER'
    const orderedStages = byWorkflow(selected.batch.stages)
    const position = orderedStages.findIndex(
      (stage) => stage.batchStageId === selected.stage.batchStageId,
    )
    const previousStage =
      position > 0 ? orderedStages[position - 1]! : undefined
    const readyAt = previousStage
      ? previousStage.status === 'COMPLETED'
        ? (previousStage.actualEndedAt?.getTime() ??
          previousStage.plannedEndAt?.getTime() ??
          nowMs)
        : (previousStage.plannedEndAt?.getTime() ?? nowMs)
      : nowMs
    // Keep the in-memory stage in step so the next stage of the batch and the ETA use the new times.
    const applyPlan = (
      machineId: number | null,
      start: number,
      end: number,
    ) => {
      if (
        selected.stage.machineId !== machineId ||
        selected.stage.plannedStartAt?.getTime() !== start ||
        selected.stage.plannedEndAt?.getTime() !== end
      ) {
        changedStageIds.push(selected.stage.batchStageId)
        changedOrderIds.add(selected.order.orderId)
        stagePlans.push({
          batchStageId: selected.stage.batchStageId,
          machineId,
          plannedStartAt: new Date(start),
          plannedEndAt: new Date(end),
        })
      }
      selected.stage.machineId = machineId
      selected.stage.plannedStartAt = new Date(start)
      selected.stage.plannedEndAt = new Date(end)
      scheduled.add(selected.stage.batchStageId)
    }
    if (isManualStage(selected.stage.stage)) {
      // Sorting that already started keeps its real start (it begins when the order is accepted).
      const start = selected.stage.actualStartedAt?.getTime() ?? readyAt
      applyPlan(null, start, start + manualMinutes(selected.stage.stage))
      continue
    }
    const candidates = machines.filter(
      (machine) =>
        operational(machine.status) &&
        machine.type === stageType &&
        machine.capacityKg >= selected.batch.weightKg &&
        Number.isFinite(availability.get(machine.machineId) ?? nowMs),
    )
    if (!candidates.length) {
      unscheduledStageIds.push(selected.stage.batchStageId)
      unscheduledOrderIds.add(selected.order.orderId)
      // Drop a stale machine (e.g. one now under maintenance) so the queue shows it unassigned.
      if (
        selected.stage.machineId !== null &&
        selected.stage.plannedStartAt &&
        selected.stage.plannedEndAt
      ) {
        changedStageIds.push(selected.stage.batchStageId)
        changedOrderIds.add(selected.order.orderId)
        stagePlans.push({
          batchStageId: selected.stage.batchStageId,
          machineId: null,
          plannedStartAt: selected.stage.plannedStartAt,
          plannedEndAt: selected.stage.plannedEndAt,
        })
        selected.stage.machineId = null
      }
      continue
    }
    const finish = (machine: ScheduleMachine) =>
      Math.max(readyAt, availability.get(machine.machineId) ?? nowMs) +
      machine.processingMinutes * MINUTE
    candidates.sort(
      (a, b) =>
        finish(a) - finish(b) ||
        a.capacityKg - b.capacityKg ||
        a.machineId - b.machineId,
    )
    const machine = candidates[0]!
    const start = Math.max(
      readyAt,
      availability.get(machine.machineId) ?? nowMs,
    )
    const end = start + machine.processingMinutes * MINUTE
    availability.set(machine.machineId, end)
    applyPlan(machine.machineId, start, end)
  }

  const batchEtas: Array<{
    batchId: number
    previous: Date | null
    estimatedAt: Date
  }> = []
  const affectedOrders: Array<{
    orderId: number
    previousEstimatedAt: Date | null
    estimatedAt: string
    late: boolean
  }> = []
  for (const order of orders) {
    let orderEta = nowMs
    for (const batch of order.batches) {
      const eta = projectedEnd(batch.stages, nowMs)
      orderEta = Math.max(orderEta, eta)
      batchEtas.push({
        batchId: batch.batchId,
        previous: batch.estimatedAt,
        estimatedAt: new Date(eta),
      })
    }
    affectedOrders.push({
      orderId: order.orderId,
      previousEstimatedAt: order.estimatedAt,
      estimatedAt: new Date(orderEta).toISOString(),
      // A stage no machine can run leaves the ETA unknown: treat the order as at risk.
      late:
        unscheduledOrderIds.has(order.orderId) ||
        orderEta > order.pickupAt.getTime(),
    })
  }
  return {
    lockedStageIds,
    changedStageIds,
    changedOrderIds: [...changedOrderIds],
    unscheduledStageIds,
    stagePlans,
    batchEtas,
    affectedOrders,
  }
}

// Writes a computed schedule: planned stage times, batch/order ETAs and late-risk alerts.
export async function applySchedule(
  tx: Prisma.TransactionClient,
  result: ScheduleResult,
  reason: Reason,
) {
  for (const plan of result.stagePlans)
    await tx.batchStage.update({
      where: { batchStageId: plan.batchStageId },
      data: {
        machineId: plan.machineId,
        plannedStartAt: plan.plannedStartAt,
        plannedEndAt: plan.plannedEndAt,
      },
    })
  for (const batch of result.batchEtas)
    if (batch.previous?.getTime() !== batch.estimatedAt.getTime())
      await tx.orderBatch.update({
        where: { batchId: batch.batchId },
        data: { estimatedAt: batch.estimatedAt },
      })
  for (const order of result.affectedOrders) {
    const estimatedAt = new Date(order.estimatedAt)
    if (order.previousEstimatedAt?.getTime() !== estimatedAt.getTime())
      await tx.laundryOrder.update({
        where: { orderId: order.orderId },
        data: { estimatedAt },
      })
    if (!order.late) continue
    const existing = await tx.alert.findFirst({
      where: {
        orderId: order.orderId,
        type: 'LATE_RISK',
        status: { not: 'RESOLVED' },
      },
    })
    if (existing)
      await tx.alert.update({
        where: { alertId: existing.alertId },
        data: { reason: `ETA bị ảnh hưởng bởi ${reason}` },
      })
    else
      await tx.alert.create({
        data: {
          orderId: order.orderId,
          type: 'LATE_RISK',
          severity: 'WARNING',
          reason: `ETA bị ảnh hưởng bởi ${reason}`,
        },
      })
  }
  return {
    reason,
    lockedStageIds: result.lockedStageIds,
    changedStageIds: result.changedStageIds,
    changedOrderIds: result.changedOrderIds,
    unscheduledStageIds: result.unscheduledStageIds,
    affectedOrders: result.affectedOrders.map(
      ({ orderId, estimatedAt, late }) => ({
        orderId,
        estimatedAt,
        late,
      }),
    ),
  }
}

export async function rescheduleAll(reason: Reason) {
  return prisma.$transaction((tx) => rescheduleWithClient(tx, reason))
}

export async function rescheduleWithClient(
  tx: Prisma.TransactionClient,
  reason: Reason,
) {
  return applySchedule(
    tx,
    computeSchedule(await loadScheduleState(tx), new Date()),
    reason,
  )
}

// --- Feasibility of one order inside the whole schedule ---------------------------------

export const lateOrderIds = (result: ScheduleResult) =>
  new Set(
    result.affectedOrders
      .filter((entry) => entry.late)
      .map((entry) => entry.orderId),
  )

export const withPickup = (
  state: ScheduleState,
  orderId: number,
  pickupAt: Date,
) => ({
  ...state,
  orders: state.orders.map((order) =>
    order.orderId === orderId ? { ...order, pickupAt } : order,
  ),
})

// Feasible when the order meets its pickup, every stage of it can be placed on a machine, and
// no order that was on time in `baselineLate`'s schedule becomes late.
export function evaluateOrder(
  state: ScheduleState,
  orderId: number,
  baselineLate: Set<number>,
  now: Date,
) {
  const result = computeSchedule(state, now)
  const ownStageIds = new Set(
    state.orders
      .find((order) => order.orderId === orderId)
      ?.batches.flatMap((batch) =>
        batch.stages.map((stage) => stage.batchStageId),
      ) ?? [],
  )
  const own = result.affectedOrders.find((entry) => entry.orderId === orderId)
  const newlyLate = result.affectedOrders.filter(
    (entry) =>
      entry.late &&
      entry.orderId !== orderId &&
      !baselineLate.has(entry.orderId),
  )
  const unscheduled = result.unscheduledStageIds.filter((id) =>
    ownStageIds.has(id),
  )
  return {
    result,
    own,
    newlyLate,
    unscheduled,
    feasible:
      Boolean(own) && !own!.late && !newlyLate.length && !unscheduled.length,
  }
}

// Earliest whole-minute pickup after `from` that is feasible, or null when no later pickup
// helps (a stage that no machine can run). A later pickup lowers this order's priority, so it
// harms others less and eventually fits; binary search narrows it down.
export function earliestFeasiblePickup(
  state: ScheduleState,
  orderId: number,
  from: Date,
  baselineLate: Set<number>,
  now: Date,
) {
  const check = (ms: number) =>
    evaluateOrder(
      withPickup(state, orderId, new Date(ms)),
      orderId,
      baselineLate,
      now,
    )
  const ceilMinute = (ms: number) => Math.ceil(ms / MINUTE) * MINUTE
  let low = ceilMinute(Math.max(from.getTime(), now.getTime()))
  const first = check(low)
  if (first.feasible) return new Date(low)
  if (first.unscheduled.length) return null
  let high: number | null = null
  let probe = ceilMinute(
    Math.max(
      low + MINUTE,
      first.own ? new Date(first.own.estimatedAt).getTime() : low,
    ),
  )
  let step = 15 * MINUTE
  for (let attempt = 0; attempt < 12; attempt++) {
    const evaluation = check(probe)
    if (evaluation.feasible) {
      high = probe
      break
    }
    low = probe
    const ownEta = evaluation.own
      ? new Date(evaluation.own.estimatedAt).getTime()
      : probe
    probe = ceilMinute(Math.max(probe + step, ownEta))
    step *= 2
  }
  if (high === null) return null
  let feasibleAt: number = high
  while (feasibleAt - low > MINUTE) {
    const middle: number =
      low + Math.floor((feasibleAt - low) / 2 / MINUTE) * MINUTE
    if (check(middle).feasible) feasibleAt = middle
    else low = middle
  }
  return new Date(feasibleAt)
}
