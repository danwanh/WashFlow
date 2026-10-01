import type { Request, Response } from 'express'
import {
  describeOrders,
  fail,
  getBody,
  getId,
  prisma,
} from '../services/api.js'
import {
  applySchedule,
  computeSchedule,
  lateOrderIds,
  loadScheduleState,
  rescheduleAll,
  type ScheduleState,
  type ScheduleStage,
} from '../services/rescheduler.js'
const view = (m: any) => ({
  machine_id: m.machineId,
  name: m.name,
  type: m.type,
  status: m.status,
  capacity_kg: Number(m.capacityKg),
  processing_minutes: m.processingMinutes,
  updated_at: m.updatedAt.toISOString(),
  active_stage: m.stages?.[0]
    ? {
        batch_stage_id: m.stages[0].batchStageId,
        stage: m.stages[0].stage,
        status: m.stages[0].status,
        order_id: m.stages[0].batch?.orderId ?? null,
        customer: m.stages[0].batch?.order?.customer?.name ?? null,
        planned_end_at: m.stages[0].plannedEndAt?.toISOString() ?? null,
      }
    : null,
})
export async function list(_req: Request, res: Response) {
  res.json(
    (
      await prisma.machine.findMany({
        orderBy: { machineId: 'asc' },
        include: {
          stages: {
            where: { status: { in: ['IN_PROGRESS', 'MACHINE_FINISHED'] } },
            orderBy: { plannedEndAt: 'asc' },
            take: 1,
            include: {
              batch: { include: { order: { include: { customer: true } } } },
            },
          },
        },
      })
    ).map(view),
  )
}

type StageRef = { orderId: number; batchId: number; stage: ScheduleStage }

// The schedule as it would be with the machine under maintenance: the batch running in it is
// stopped (treated as not washed) and goes back to waiting for a machine.
function maintenanceImpact(state: ScheduleState, machineId: number, now: Date) {
  const baseline = computeSchedule(state, now)
  const baselineLate = lateOrderIds(baseline)
  const baselineUnscheduled = new Set(baseline.unscheduledStageIds)
  const refs: StageRef[] = state.orders.flatMap((order) =>
    order.batches.flatMap((batch) =>
      batch.stages.map((stage) => ({
        orderId: order.orderId,
        batchId: batch.batchId,
        stage,
      })),
    ),
  )
  const running = refs.find(
    (ref) =>
      ref.stage.machineId === machineId && ref.stage.status === 'IN_PROGRESS',
  )
  // A stopped batch restarts from now with the same cycle length.
  const restart = running
    ? (() => {
        const start = running.stage.plannedStartAt?.getTime() ?? now.getTime()
        const length = Math.max(
          0,
          (running.stage.plannedEndAt?.getTime() ?? start) - start,
        )
        return {
          plannedStartAt: now,
          plannedEndAt: new Date(now.getTime() + length),
        }
      })()
    : null
  const trial: ScheduleState = {
    machines: state.machines.map((machine) =>
      machine.machineId === machineId
        ? { ...machine, status: 'MAINTENANCE' }
        : machine,
    ),
    orders: state.orders.map((order) => ({
      ...order,
      batches: order.batches.map((batch) => ({
        ...batch,
        stages: batch.stages.map((stage) =>
          running &&
          restart &&
          stage.batchStageId === running.stage.batchStageId
            ? {
                ...stage,
                status: 'PLANNED',
                machineId: null,
                actualStartedAt: null,
                ...restart,
              }
            : stage,
        ),
      })),
    })),
  }
  const result = computeSchedule(trial, now)
  const plans = new Map(
    result.stagePlans.map((plan) => [plan.batchStageId, plan]),
  )
  const unscheduled = new Set(result.unscheduledStageIds)
  const moved = refs.filter(
    (ref) =>
      ref.stage.status === 'PLANNED' &&
      ref.stage.machineId === machineId &&
      !unscheduled.has(ref.stage.batchStageId),
  )
  return {
    result,
    running,
    restart,
    plans,
    moved,
    // Stages that had a machine before but have none with this one under maintenance.
    unscheduled: refs.filter(
      (ref) =>
        unscheduled.has(ref.stage.batchStageId) &&
        !baselineUnscheduled.has(ref.stage.batchStageId),
    ),
    newlyLate: result.affectedOrders.filter(
      (entry) => entry.late && !baselineLate.has(entry.orderId),
    ),
  }
}

async function describeImpact(impact: ReturnType<typeof maintenanceImpact>) {
  const refs = [
    ...(impact.running ? [impact.running] : []),
    ...impact.moved,
    ...impact.unscheduled,
  ]
  const [orders, machines] = await Promise.all([
    prisma.laundryOrder.findMany({
      where: { orderId: { in: refs.map((ref) => ref.orderId) } },
      select: { orderId: true, customer: { select: { name: true } } },
    }),
    prisma.machine.findMany({ select: { machineId: true, name: true } }),
  ])
  const describe = (ref: StageRef) => {
    const plan = impact.plans.get(ref.stage.batchStageId)
    const machineId = plan ? plan.machineId : ref.stage.machineId
    return {
      order_id: ref.orderId,
      customer:
        orders.find((order) => order.orderId === ref.orderId)?.customer.name ??
        'Không rõ khách hàng',
      batch_id: ref.batchId,
      batch_stage_id: ref.stage.batchStageId,
      stage: ref.stage.stage,
      new_machine_name:
        machines.find((machine) => machine.machineId === machineId)?.name ??
        null,
      new_planned_start_at:
        (plan?.plannedStartAt ?? ref.stage.plannedStartAt)?.toISOString() ??
        null,
    }
  }
  return {
    stopped: impact.running ? describe(impact.running) : null,
    moved: impact.moved.map(describe),
    unscheduled: impact.unscheduled.map(describe),
    late_orders: await describeOrders(impact.newlyLate),
  }
}

// Staff only switch a machine between in service and MAINTENANCE; BUSY follows the batches.
export async function update(req: Request, res: Response) {
  const machineId = getId(req.params.machineId)
  const body = getBody(req)
  const status = body.status
  if (status !== 'AVAILABLE' && status !== 'MAINTENANCE')
    fail(400, 'INVALID_INPUT', 'Status must be AVAILABLE or MAINTENANCE')
  const current = await prisma.machine.findUnique({
    where: { machineId },
    include: {
      stages: {
        where: { status: { in: ['IN_PROGRESS', 'MACHINE_FINISHED'] } },
        take: 1,
      },
    },
  })
  if (!current) fail(404, 'NOT_FOUND', 'Machine not found')

  if (status === 'AVAILABLE') {
    if (current.status !== 'MAINTENANCE')
      fail(
        409,
        'INVALID_STATE',
        'Only a machine under maintenance can return to service',
      )
    // A finished batch still waiting to be unloaded keeps the machine occupied.
    const machine = await prisma.machine.update({
      where: { machineId },
      data: { status: current.stages.length ? 'BUSY' : 'AVAILABLE' },
    })
    await rescheduleAll('MACHINE_RETURNED')
    return res.json(view(machine))
  }

  if (current.status === 'MAINTENANCE')
    fail(409, 'INVALID_STATE', 'Machine is already under maintenance')
  const now = new Date()
  if (body.preview === true)
    return res.json(
      await describeImpact(
        maintenanceImpact(await loadScheduleState(), machineId, now),
      ),
    )

  await prisma.$transaction(
    async (tx) => {
      const impact = maintenanceImpact(
        await loadScheduleState(tx),
        machineId,
        now,
      )
      await tx.machine.update({
        where: { machineId },
        data: { status: 'MAINTENANCE' },
      })
      if (impact.running && impact.restart) {
        const { count } = await tx.batchStage.updateMany({
          where: {
            batchStageId: impact.running.stage.batchStageId,
            status: 'IN_PROGRESS',
          },
          data: {
            status: 'PLANNED',
            machineId: null,
            actualStartedAt: null,
            ...impact.restart,
          },
        })
        // The cycle finished in the meantime: the schedule above no longer applies.
        if (!count)
          fail(409, 'INVALID_STATE', 'The machine changed state; try again')
        await tx.orderBatch.update({
          where: { batchId: impact.running.batchId },
          data: { status: 'WAITING' },
        })
      }
      await applySchedule(tx, impact.result, 'MACHINE_MAINTENANCE')
    },
    { timeout: 20_000 },
  )
  res.json(
    view(await prisma.machine.findUniqueOrThrow({ where: { machineId } })),
  )
}
