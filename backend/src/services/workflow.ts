import { fail, getOrder, orderInclude, prisma } from './api.js'

const stageOrder = (stage: string) => (stage === 'WASH' ? 0 : 1)

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
    await prisma.$transaction([
      prisma.batchStage.update({
        where: { batchStageId: stageId },
        data: {
          machineId: machine.machineId,
          status: 'IN_PROGRESS',
          actualStartedAt: now,
        },
      }),
      prisma.machine.update({
        where: { machineId: machine.machineId },
        data: { status: 'BUSY' },
      }),
      prisma.orderBatch.update({
        where: { batchId },
        data: {
          status: current.stage === 'WASH' ? 'WASHING' : 'DRYING',
          currentStage: current.stage,
        },
      }),
    ])
  } else if (action === 'finished') {
    if (current.status !== 'IN_PROGRESS')
      fail(400, 'INVALID_STATE', 'Stage is not in progress')
    await prisma.$transaction([
      prisma.batchStage.update({
        where: { batchStageId: stageId },
        data: { status: 'MACHINE_FINISHED', actualMachineFinishedAt: now },
      }),
      prisma.orderBatch.update({
        where: { batchId },
        data: { status: 'WAITING_FOR_UNLOAD' },
      }),
    ])
  } else {
    if (current.status !== 'MACHINE_FINISHED' || !current.machineId)
      fail(400, 'INVALID_STATE', 'Stage is not waiting for unload')
    const next = [...batch.stages]
      .sort((a, b) => stageOrder(a.stage) - stageOrder(b.stage))
      .find(
        (stage) => stage.status === 'PLANNED' && stage.batchStageId !== stageId,
      )
    await prisma.$transaction([
      prisma.batchStage.update({
        where: { batchStageId: stageId },
        data: { status: 'COMPLETED', actualEndedAt: now },
      }),
      prisma.machine.update({
        where: { machineId: current.machineId },
        data: { status: 'AVAILABLE' },
      }),
      prisma.orderBatch.update({
        where: { batchId },
        data: {
          status: next ? 'WAITING' : 'COMPLETED',
          currentStage: next?.stage ?? null,
          completedAt: next ? null : now,
        },
      }),
    ])
    const updatedBatches = await prisma.orderBatch.findMany({
      where: { orderId: batch.orderId },
    })
    if (updatedBatches.every((item) => item.status === 'COMPLETED')) {
      await prisma.laundryOrder.update({
        where: { orderId: batch.orderId },
        data: { status: 'FOLDING_PACKING' },
      })
    }
  }
  return getOrder(batch.orderId)
}

export async function completePacking(orderId: number) {
  const order = await getOrder(orderId)
  if (!order) fail(404, 'NOT_FOUND', 'Order not found')
  if (order.batches.some((batch) => batch.status !== 'COMPLETED'))
    fail(400, 'INVALID_STATE', 'All batches must be machine-complete')
  if (order.status !== 'FOLDING_PACKING')
    fail(400, 'INVALID_STATE', 'Order is not waiting for packing')
  const now = new Date()
  return prisma.laundryOrder.update({
    where: { orderId },
    data: { status: 'READY', packingCompletedAt: now, readyAt: now },
    include: orderInclude,
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
