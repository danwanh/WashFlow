import { prisma } from './api.js'
import type { Prisma } from '../../generated/prisma/client.js'

type Reason = string
const stageOrder = (stage: string) => (stage === 'WASH' ? 0 : 1)
const operational = (status: string) =>
  !['OFFLINE', 'MAINTENANCE'].includes(status)

export async function rescheduleAll(reason: Reason) {
  return prisma.$transaction((tx) => rescheduleWithClient(tx, reason))
}

// Kept separate so a caller can trial a schedule inside its own transaction.
export async function rescheduleWithClient(
  tx: Prisma.TransactionClient,
  reason: Reason,
) {
  const now = new Date()
  const [orders, machines] = await Promise.all([
    tx.laundryOrder.findMany({
      where: { status: { not: 'COMPLETED' } },
      include: { batches: { include: { stages: true } } },
    }),
    tx.machine.findMany(),
  ])
  const machineById = new Map(
    machines.map((machine) => [machine.machineId, machine]),
  )
  const availability = new Map(
    machines.map((machine) => [
      machine.machineId,
      machine.status === 'BUSY' ? Number.POSITIVE_INFINITY : now.getTime(),
    ]),
  )
  const lockedStageIds: number[] = []
  const changedStageIds: number[] = []
  const changedOrderIds = new Set<number>()
  const unscheduledStageIds: number[] = []

  for (const order of orders) {
    for (const batch of order.batches) {
      const stages = [...batch.stages].sort(
        (a, b) => stageOrder(a.stage) - stageOrder(b.stage),
      )
      for (const stage of stages) {
        if (
          stage.status === 'IN_PROGRESS' ||
          stage.status === 'MACHINE_FINISHED'
        ) {
          lockedStageIds.push(stage.batchStageId)
          if (stage.machineId) {
            availability.set(
              stage.machineId,
              stage.status === 'MACHINE_FINISHED'
                ? Number.POSITIVE_INFINITY
                : (stage.plannedEndAt?.getTime() ?? Number.POSITIVE_INFINITY),
            )
          }
        } else if (stage.status === 'COMPLETED' && stage.machineId) {
          availability.set(
            stage.machineId,
            Math.max(
              availability.get(stage.machineId) ?? now.getTime(),
              stage.actualEndedAt?.getTime() ??
                stage.plannedEndAt?.getTime() ??
                now.getTime(),
            ),
          )
        }
      }
    }
  }

  const scheduled = new Set<number>()
  const pending = orders.flatMap((order) =>
    order.batches.flatMap((batch) =>
      [...batch.stages]
        .sort((a, b) => stageOrder(a.stage) - stageOrder(b.stage))
        .filter((stage) => stage.status === 'PLANNED')
        .map((stage) => ({ order, batch, stage })),
    ),
  )

  while (pending.length) {
    const eligible = pending.filter(({ batch, stage }) => {
      const stages = [...batch.stages].sort(
        (a, b) => stageOrder(a.stage) - stageOrder(b.stage),
      )
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
      const slack = (entry: typeof a) => {
        const duration =
          entry.stage.plannedEndAt && entry.stage.plannedStartAt
            ? entry.stage.plannedEndAt.getTime() -
              entry.stage.plannedStartAt.getTime()
            : 0
        return entry.order.pickupAt.getTime() - now.getTime() - duration
      }
      return (
        slack(a) - slack(b) ||
        b.order.priority - a.order.priority ||
        a.order.pickupAt.getTime() - b.order.pickupAt.getTime() ||
        a.order.createdAt.getTime() - b.order.createdAt.getTime()
      )
    })
    const selected = eligible[0]!
    const pendingIndex = pending.indexOf(selected)
    pending.splice(pendingIndex, 1)
    const stageType = selected.stage.stage === 'WASH' ? 'WASHER' : 'DRYER'
    const previous = [...selected.batch.stages]
      .sort((a, b) => stageOrder(a.stage) - stageOrder(b.stage))
      .findIndex((stage) => stage.batchStageId === selected.stage.batchStageId)
    const orderedStages = [...selected.batch.stages].sort(
      (a, b) => stageOrder(a.stage) - stageOrder(b.stage),
    )
    const previousStage =
      previous > 0 ? orderedStages[previous - 1]! : undefined
    const readyAt = previousStage
      ? previousStage.status === 'COMPLETED'
        ? (previousStage.actualEndedAt?.getTime() ??
          previousStage.plannedEndAt?.getTime() ??
          now.getTime())
        : (previousStage.plannedEndAt?.getTime() ?? now.getTime())
      : now.getTime()
    const candidates = machines.filter(
      (machine) =>
        operational(machine.status) &&
        machine.type === stageType &&
        Number(machine.capacityKg) >= Number(selected.batch.weightKg) &&
        Number.isFinite(availability.get(machine.machineId) ?? now.getTime()),
    )
    if (!candidates.length) {
      unscheduledStageIds.push(selected.stage.batchStageId)
      continue
    }
    candidates.sort((a, b) => {
      const duration = (machine: typeof a) => machine.processingMinutes * 60_000
      const finishA =
        Math.max(readyAt, availability.get(a.machineId) ?? now.getTime()) +
        duration(a)
      const finishB =
        Math.max(readyAt, availability.get(b.machineId) ?? now.getTime()) +
        duration(b)
      return (
        finishA - finishB ||
        Number(a.capacityKg) - Number(b.capacityKg) ||
        a.machineId - b.machineId
      )
    })
    const machine = candidates[0]!
    const start = Math.max(
      readyAt,
      availability.get(machine.machineId) ?? now.getTime(),
    )
    const end = start + machine.processingMinutes * 60_000
    availability.set(machine.machineId, end)
    if (
      selected.stage.machineId !== machine.machineId ||
      selected.stage.plannedStartAt?.getTime() !== start ||
      selected.stage.plannedEndAt?.getTime() !== end
    ) {
      changedStageIds.push(selected.stage.batchStageId)
      changedOrderIds.add(selected.order.orderId)
      await tx.batchStage.update({
        where: { batchStageId: selected.stage.batchStageId },
        data: {
          machineId: machine.machineId,
          plannedStartAt: new Date(start),
          plannedEndAt: new Date(end),
        },
      })
    }
    scheduled.add(selected.stage.batchStageId)
  }

  const affectedOrders: Array<{
    orderId: number
    estimatedAt: string
    late: boolean
  }> = []
  for (const order of orders) {
    let orderEta = now.getTime()
    for (const batch of order.batches) {
      const stages = [...batch.stages].sort(
        (a, b) => stageOrder(a.stage) - stageOrder(b.stage),
      )
      const last = stages.at(-1)
      const eta =
        last?.status === 'COMPLETED'
          ? (last.actualEndedAt?.getTime() ?? now.getTime())
          : last?.status === 'MACHINE_FINISHED'
            ? (last.actualMachineFinishedAt?.getTime() ??
              last.plannedEndAt?.getTime() ??
              now.getTime())
            : (last?.plannedEndAt?.getTime() ?? now.getTime())
      orderEta = Math.max(orderEta, eta)
      await tx.orderBatch.update({
        where: { batchId: batch.batchId },
        data: { estimatedAt: new Date(eta) },
      })
    }
    const late = Math.max(orderEta, now.getTime()) > order.pickupAt.getTime()
    await tx.laundryOrder.update({
      where: { orderId: order.orderId },
      data: { estimatedAt: new Date(orderEta) },
    })
    if (late) {
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
    affectedOrders.push({
      orderId: order.orderId,
      estimatedAt: new Date(orderEta).toISOString(),
      late,
    })
  }
  return {
    reason,
    lockedStageIds,
    changedStageIds,
    changedOrderIds: [...changedOrderIds],
    unscheduledStageIds,
    affectedOrders,
  }
}
