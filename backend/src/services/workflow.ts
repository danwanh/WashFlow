import { fail, getOrder, orderInclude, prisma } from './api.js'
import {
  recordMachineFinishedAlert,
  resolveMachineFinishedAlert,
} from './alerts.js'
import { rescheduleAll } from './rescheduler.js'
import { isManualStage, stageRank } from './timing.js'
import { notifyChange } from './events.js'

const stageOrder = stageRank

export async function updateStage(
  batchId: number,
  stageId: number,
  action: 'start' | 'finished' | 'unload',
  machineId?: number,
) {
  const batch = await prisma.orderBatch.findUnique({
    where: { batchId },
    include: { stages: true },
  })
  const current = batch?.stages.find((stage) => stage.batchStageId === stageId)
  if (!batch || !current) fail(404, 'NOT_FOUND', 'Batch or stage not found')
  const now = new Date()
  const ordered = [...batch.stages].sort((a, b) => stageOrder(a.stage) - stageOrder(b.stage))
  const index = ordered.findIndex((stage) => stage.batchStageId === stageId)
  if (ordered.slice(0, index).some((stage) => stage.status !== 'COMPLETED'))
    fail(400, 'INVALID_STATE', 'Earlier stages of this batch are not finished')
  const next = ordered.slice(index + 1).find((stage) => stage.status === 'PLANNED')

  // Sorting (CLASSIFY) and PACKING are manual: staff confirm them with "machine-finished".
  if (isManualStage(current.stage)) {
    if (action !== 'finished' || current.status !== 'PLANNED')
      fail(400, 'INVALID_STATE', 'This stage is completed with machine-finished')
    // Every write below is guarded by the state it expects, so two staff (or two clicks)
    // acting at once never both apply the same transition.
    await prisma.$transaction(async (tx) => {
      const { count } = await tx.batchStage.updateMany({
        where: { batchStageId: stageId, status: 'PLANNED' },
        data: {
          status: 'COMPLETED',
          actualStartedAt: current.actualStartedAt ?? now,
          actualEndedAt: now,
        },
      })
      if (!count) fail(409, 'INVALID_STATE', 'Stage was already completed')
      await tx.orderBatch.update({
        where: { batchId },
        data: {
          status: next ? 'WAITING' : 'COMPLETED',
          currentStage: next?.stage ?? null,
          completedAt: next ? null : now,
        },
      })
    })
    await syncOrderStatus(batch.orderId, now)
    await rescheduleAll(current.stage === 'CLASSIFY' ? 'CLASSIFICATION_COMPLETED' : 'PACKING_COMPLETED')
    return getOrder(batch.orderId)
  }

  if (action === 'start') {
    if (batch.status !== 'WAITING' || current.status !== 'PLANNED')
      fail(400, 'INVALID_STATE', 'Batch and stage are not ready')
    const machine = await prisma.machine.findUnique({
      where: { machineId: machineId ?? current.machineId ?? 0 },
    })
    const correctType =
      current.stage === 'WASH'
        ? machine?.type === 'WASHER'
        : machine?.type === 'DRYER'
    if (
      !machine ||
      machine.status !== 'AVAILABLE' ||
      Number(machine.capacityKg) < Number(batch.weightKg) ||
      !correctType
    )
      fail(409, 'MACHINE_UNAVAILABLE', 'Machine cannot run this stage')
    await prisma.$transaction(async (tx) => {
      // Claim the machine only while it is still free: two bags dropped on the same machine
      // at once cannot both start.
      const claimed = await tx.machine.updateMany({
        where: { machineId: machine.machineId, status: 'AVAILABLE' },
        data: { status: 'BUSY' },
      })
      if (!claimed.count) fail(409, 'MACHINE_UNAVAILABLE', 'Machine cannot run this stage')
      const started = await tx.batchStage.updateMany({
        where: { batchStageId: stageId, status: 'PLANNED' },
        // Re-anchor the plan on the real start and the chosen machine's cycle length, so
        // timing and the rescheduler know when this machine actually frees up.
        data: {
          machineId: machine.machineId,
          status: 'IN_PROGRESS',
          actualStartedAt: now,
          plannedStartAt: now,
          plannedEndAt: new Date(now.getTime() + machine.processingMinutes * 60_000),
        },
      })
      if (!started.count) fail(400, 'INVALID_STATE', 'Batch and stage are not ready')
      await tx.orderBatch.update({
        where: { batchId },
        data: {
          status: current.stage === 'WASH' ? 'WASHING' : 'DRYING',
          currentStage: current.stage,
        },
      })
    })
  } else if (action === 'finished') {
    if (current.status !== 'IN_PROGRESS')
      fail(400, 'INVALID_STATE', 'Stage is not in progress')
    await finishMachineStage(stageId, batchId, batch.orderId, now)
  } else {
    if (current.status !== 'MACHINE_FINISHED' || !current.machineId)
      fail(400, 'INVALID_STATE', 'Stage is not waiting for unload')
    const machineId = current.machineId
    await prisma.$transaction(async (tx) => {
      const { count } = await tx.batchStage.updateMany({
        where: { batchStageId: stageId, status: 'MACHINE_FINISHED' },
        data: { status: 'COMPLETED', actualEndedAt: now },
      })
      if (!count) fail(409, 'INVALID_STATE', 'Stage was already unloaded')
      // Free the machine, but keep it in MAINTENANCE if staff took it out of service
      // while the cycle was running.
      await tx.machine.updateMany({
        where: { machineId, status: 'BUSY' },
        data: { status: 'AVAILABLE' },
      })
      await tx.orderBatch.update({
        where: { batchId },
        data: {
          status: next ? 'WAITING' : 'COMPLETED',
          currentStage: next?.stage ?? null,
          completedAt: next ? null : now,
        },
      })
    })
    await resolveMachineFinishedAlert(batch.orderId, batch.batchId, now)
    await syncOrderStatus(batch.orderId, now)
  }
  await rescheduleAll(
    action === 'start'
      ? 'STAGE_STARTED'
      : action === 'finished'
        ? 'MACHINE_FINISHED'
        : 'STAGE_UNLOADED',
  )
  return getOrder(batch.orderId)
}

// Moves a running machine stage to MACHINE_FINISHED. The update only applies while the stage
// is still IN_PROGRESS, so a manual "Máy xong" and the automatic check never both apply it.
async function finishMachineStage(
  stageId: number,
  batchId: number,
  orderId: number,
  finishedAt: Date,
) {
  const finished = await prisma.$transaction(async (tx) => {
    const { count } = await tx.batchStage.updateMany({
      where: { batchStageId: stageId, status: 'IN_PROGRESS' },
      data: { status: 'MACHINE_FINISHED', actualMachineFinishedAt: finishedAt },
    })
    if (count)
      await tx.orderBatch.update({
        where: { batchId },
        data: { status: 'WAITING_FOR_UNLOAD' },
      })
    return count > 0
  })
  if (finished) await recordMachineFinishedAlert(orderId, batchId, finishedAt)
  return finished
}

// Machines finish on their own: every running WASH/DRY stage whose cycle has elapsed
// (actual start + planned length, the same end the queue counts down to) is marked
// MACHINE_FINISHED at that end time. Staff still confirm the unload.
export async function autoFinishMachines(now = new Date()) {
  const running = await prisma.batchStage.findMany({
    where: { status: 'IN_PROGRESS', stage: { in: ['WASH', 'DRY'] } },
    include: { batch: { select: { orderId: true } } },
  })
  let finished = 0
  for (const stage of running) {
    if (!stage.actualStartedAt || !stage.plannedStartAt || !stage.plannedEndAt) continue
    const end =
      stage.actualStartedAt.getTime() +
      Math.max(0, stage.plannedEndAt.getTime() - stage.plannedStartAt.getTime())
    if (end > now.getTime()) continue
    if (
      await finishMachineStage(stage.batchStageId, stage.batchId, stage.batch.orderId, new Date(end))
    )
      finished += 1
  }
  if (finished) {
    await rescheduleAll('MACHINE_FINISHED')
    notifyChange(['queue', 'alerts'])
  }
  return finished
}

// The order status follows its batch stages: every sorting done -> WAITING,
// only packing left -> FOLDING_PACKING, every stage done -> READY.
async function syncOrderStatus(orderId: number, now: Date) {
  const order = await prisma.laundryOrder.findUnique({
    where: { orderId },
    include: { batches: { include: { stages: true } } },
  })
  if (!order || order.status === 'READY' || order.status === 'COMPLETED') return
  const stages = order.batches.flatMap((batch) => batch.stages)
  const done = (stage: (typeof stages)[number]) => stage.status === 'COMPLETED'
  const status = stages.every(done)
    ? 'READY'
    : stages.filter((stage) => stage.stage !== 'PACKING').every(done)
      ? 'FOLDING_PACKING'
      : stages.filter((stage) => stage.stage === 'CLASSIFY').every(done)
        ? 'WAITING'
        : 'RECEIVED'
  if (status === order.status) return
  await prisma.laundryOrder.update({
    where: { orderId },
    data: {
      status,
      ...(status !== 'RECEIVED' && !order.classifiedAt ? { classifiedAt: now } : {}),
      ...(status === 'READY' ? { packingCompletedAt: now, readyAt: now } : {}),
    },
  })
}

export async function sendNotification(
  orderId: number,
  input: { type?: string; channel?: string; content?: string },
) {
  const order = await getOrder(orderId)
  if (!order) fail(404, 'NOT_FOUND', 'Order not found')
  if (order.status !== 'READY') fail(400, 'INVALID_STATE', 'Order is not ready')
  const sent = input.content !== '__FAIL__'
  const now = new Date()
  const result = await prisma.$transaction(async (tx) => {
    await tx.notification.create({
      data: {
        orderId,
        type: input.type ?? 'READY_FOR_PICKUP',
        channel: input.channel ?? 'SMS',
        content: String(input.content ?? ''),
        status: sent ? 'SENT' : 'FAILED',
        sentAt: sent ? now : null,
      },
    })
    return sent
      ? tx.laundryOrder.update({
          where: { orderId },
          data: { status: 'COMPLETED', completedAt: now },
          include: orderInclude,
        })
      : tx.laundryOrder.findUniqueOrThrow({
          where: { orderId },
          include: orderInclude,
        })
  })
  return { sent, order: result }
}
