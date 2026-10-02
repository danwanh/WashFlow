import type { Request, Response } from 'express'
import { Prisma } from '../../generated/prisma/client.js'
import {
  buildPlan,
  type PlannedBatch,
  type PlanItem,
  type Service,
} from '../services/planner.js'
import {
  ApiError,
  createPlanId,
  fail,
  getBody,
  getDate,
  getId,
  describeOrders,
  getOrder,
  orderInclude,
  planStore,
  prisma,
  orderResource,
} from '../services/api.js'
import crypto from 'node:crypto'
import {
  applySchedule,
  computeSchedule,
  earliestFeasiblePickup,
  evaluateOrder,
  lateOrderIds,
  loadScheduleState,
  rescheduleAll,
  type ScheduleOrder,
  type ScheduleState,
  withPickup,
} from '../services/rescheduler.js'
import { isManualStage } from '../services/timing.js'

const DRAFT_ORDER_ID = -1
const draftStageId = (batchIndex: number, stageIndex: number) =>
  -(batchIndex * 10 + stageIndex + 1)

// The planned order as it would sit in the real schedule, before it is saved.
function draftOrder(
  batches: PlannedBatch[],
  pickupAt: Date,
  priority: number,
  now: Date,
): ScheduleOrder {
  return {
    orderId: DRAFT_ORDER_ID,
    pickupAt,
    estimatedAt: null,
    priority,
    createdAt: now,
    batches: batches.map((batch, batchIndex) => ({
      batchId: -(batchIndex + 1),
      weightKg: batch.weightKg,
      estimatedAt: null,
      stages: batch.stages.map((stage, stageIndex) => ({
        batchStageId: draftStageId(batchIndex, stageIndex),
        stage: stage.stage,
        status: 'PLANNED',
        machineId: stage.machineId,
        plannedStartAt: new Date(stage.plannedStartAt),
        plannedEndAt: new Date(stage.plannedEndAt),
        // Sorting starts as soon as the order is accepted.
        actualStartedAt: stage.stage === 'CLASSIFY' ? now : null,
        actualMachineFinishedAt: null,
        actualEndedAt: null,
      })),
    })),
  }
}

export async function plan(req: Request, res: Response) {
  const b = getBody(req)
  if (
    !b.customer?.name ||
    !b.customer?.phone ||
    !Array.isArray(b.items) ||
    !b.items.length
  )
    fail(400, 'INVALID_INPUT', 'Customer and at least one item are required')
  if (typeof b.customer.name !== 'string' || b.customer.name.trim().length < 2)
    fail(
      400,
      'INVALID_INPUT',
      'Customer name must contain at least 2 characters',
    )
  if (
    typeof b.customer.phone !== 'string' ||
    !/^\+?[0-9 ()-]{8,20}$/.test(b.customer.phone)
  )
    fail(400, 'INVALID_INPUT', 'Invalid customer phone')
  if (!['WASH', 'DRY', 'WASH_DRY'].includes(b.service_type))
    fail(400, 'INVALID_INPUT', 'Invalid service_type')
  const priority = Number(b.priority ?? 0)
  if (!Number.isInteger(priority))
    fail(400, 'INVALID_INPUT', 'Invalid priority')
  const pickupAt = getDate(b.pickup_at, 'pickup_at')
  const items: PlanItem[] = b.items.map((x: any, index: number) => {
    if (
      !x.item_type ||
      !Number.isInteger(x.quantity) ||
      x.quantity <= 0 ||
      !Number.isFinite(Number(x.weight_kg)) ||
      Number(x.weight_kg) <= 0
    )
      fail(400, 'INVALID_INPUT', 'Invalid item')
    return {
      index,
      itemType: x.item_type,
      quantity: x.quantity,
      weightKg: Number(x.weight_kg),
      note: x.note,
    }
  })
  const now = new Date()
  const machines = await prisma.machine.findMany({
    where: { status: { in: ['AVAILABLE', 'BUSY'] } },
    include: {
      stages: {
        where: {
          status: { in: ['PLANNED', 'IN_PROGRESS', 'MACHINE_FINISHED'] },
        },
        select: {
          status: true,
          plannedEndAt: true,
          actualMachineFinishedAt: true,
          actualEndedAt: true,
        },
      },
    },
  })
  const result = buildPlan({
    items,
    service: b.service_type as Service,
    pickupAt,
    now,
    machines: machines
      // A BUSY machine with nothing running on it is out of use, as in the rescheduler.
      .filter(
        (m) =>
          m.status === 'AVAILABLE' ||
          m.stages.some((stage) => stage.status !== 'PLANNED'),
      )
      .map((m) => ({
        machineId: m.machineId,
        type: m.type,
        capacityKg: Number(m.capacityKg),
        processingMinutes: m.processingMinutes,
        status: m.status,
        availableAt: m.stages.reduce((availableAt, stage) => {
          const stageAvailableAt = stage.actualEndedAt ?? stage.plannedEndAt
          return stageAvailableAt && stageAvailableAt > availableAt
            ? stageAvailableAt
            : availableAt
        }, now),
      })),
  })

  // The planner only decides the batches. The real ETA comes from inserting them into the whole
  // schedule, which orders all work by slack and may delay other orders.
  let feasible = result.feasible
  let estimatedAt: string | null = result.estimatedAt ?? null
  let earliest: string | null = null
  let batches = result.batches
  let affected: Awaited<ReturnType<typeof describeOrders>> = []
  const warnings = result.warnings.filter(
    (warning) => warning !== 'PICKUP_TOO_EARLY',
  )
  if (result.batches.length) {
    const state = await loadScheduleState()
    const baselineLate = lateOrderIds(computeSchedule(state, now))
    const withDraft = {
      ...state,
      orders: [
        ...state.orders,
        draftOrder(result.batches, pickupAt, priority, now),
      ],
    }
    const evaluation = evaluateOrder(
      withDraft,
      DRAFT_ORDER_ID,
      baselineLate,
      now,
    )
    feasible = evaluation.feasible
    estimatedAt = evaluation.own?.estimatedAt ?? estimatedAt
    if (!feasible)
      earliest =
        earliestFeasiblePickup(
          withDraft,
          DRAFT_ORDER_ID,
          pickupAt,
          baselineLate,
          now,
        )?.toISOString() ?? null
    // Show the times the real schedule gives each stage.
    const plans = new Map(
      evaluation.result.stagePlans.map((item) => [item.batchStageId, item]),
    )
    batches = result.batches.map((batch, batchIndex) => ({
      ...batch,
      stages: batch.stages.map((stage, stageIndex) => {
        const planned = plans.get(draftStageId(batchIndex, stageIndex))
        return planned
          ? {
              ...stage,
              machineId: planned.machineId,
              plannedStartAt: planned.plannedStartAt.toISOString(),
              plannedEndAt: planned.plannedEndAt.toISOString(),
            }
          : stage
      }),
    }))
    affected = await describeOrders(evaluation.newlyLate)
    if (evaluation.own?.late) warnings.push('PICKUP_TOO_EARLY')
    if (evaluation.newlyLate.length) warnings.push('AFFECTS_OTHER_ORDERS')
    if (
      evaluation.unscheduled.length &&
      !warnings.includes('NO_FEASIBLE_MACHINE')
    )
      warnings.push('NO_FEASIBLE_MACHINE')
  }
  const planId = createPlanId({ ...b, nonce: crypto.randomUUID() })
  planStore.set(planId, {
    expires: Date.now() + 600000,
    input: b,
    result: { ...result, batches, feasible, estimatedAt },
  })
  res.json({
    plan_id: planId,
    feasible,
    estimated_at: estimatedAt,
    earliest_feasible_pickup: earliest,
    pickup_at: pickupAt.toISOString(),
    deadline_buffer_minutes: estimatedAt
      ? Math.floor(
          (pickupAt.getTime() - new Date(estimatedAt).getTime()) / 60000,
        )
      : null,
    customer: b.customer,
    items: b.items,
    compatibility_groups: result.compatibilityGroups,
    batches,
    affected_orders: affected,
    warnings,
  })
}
export async function create(req: Request, res: Response) {
  const planId = getBody(req).plan_id
  const stored = planStore.get(planId)
  if (!stored || stored.expires < Date.now())
    fail(409, 'STALE_PLAN', 'Plan is expired or no longer available')
  // Claim the plan before any await, so a double-submitted confirmation creates one order.
  planStore.delete(planId)
  if (!stored.result.feasible)
    fail(
      422,
      'PICKUP_UNFEASIBLE',
      'No valid schedule meets the requested pickup time',
    )
  const b = stored.input
  const weightKg = b.items.reduce(
    (sum: number, x: any) => sum + Number(x.weight_kg),
    0,
  )
  const serviceRate: Record<string, number> = {
    WASH: 25000,
    DRY: 20000,
    WASH_DRY: 40000,
  }
  const totalAmount =
    Number.isFinite(Number(b.total_amount)) && Number(b.total_amount) >= 0
      ? Number(b.total_amount)
      : weightKg * (serviceRate[b.service_type] ?? 0)
  const now = new Date()
  const created = await prisma
    .$transaction(
      async (tx) => {
        const baselineLate = lateOrderIds(
          computeSchedule(await loadScheduleState(tx), now),
        )
        const customer = await tx.customer.create({
          data: { name: b.customer.name, phone: b.customer.phone },
        })
        const order = await tx.laundryOrder.create({
          data: {
            customerId: customer.customerId,
            serviceType: b.service_type,
            status: 'RECEIVED',
            totalWeightKg: new Prisma.Decimal(weightKg),
            totalAmount: new Prisma.Decimal(totalAmount),
            pickupAt: getDate(b.pickup_at, 'pickup_at'),
            estimatedAt: new Date(stored.result.estimatedAt),
            priority: Number(b.priority ?? 0),
            specialNote: b.special_note ?? null,
            items: {
              create: b.items.map((x: any) => ({
                itemType: x.item_type,
                quantity: x.quantity,
                weightKg: Number(x.weight_kg),
                note: x.note ?? null,
              })),
            },
          },
          // Item indexes in the plan follow input order, so read the items back in insert order.
          include: { items: { orderBy: { orderItemId: 'asc' } } },
        })
        for (const p of stored.result.batches) {
          const batch = await tx.orderBatch.create({
            data: {
              orderId: order.orderId,
              batchNo: p.batchNo,
              weightKg: p.weightKg,
              status: 'WAITING',
              currentStage: p.stages[0]?.stage ?? null,
            },
          })
          for (const item of p.items)
            await tx.batchItem.create({
              data: {
                batchId: batch.batchId,
                orderItemId: order.items[item.itemIndex]!.orderItemId,
                weightKg: item.weightKg,
              },
            })
          for (const stage of p.stages)
            await tx.batchStage.create({
              data: {
                batchId: batch.batchId,
                stage: stage.stage,
                // Sorting and packing are manual and never tied to a machine.
                machineId: isManualStage(stage.stage) ? null : stage.machineId,
                plannedStartAt: new Date(stage.plannedStartAt),
                plannedEndAt: new Date(stage.plannedEndAt),
                // Sorting starts as soon as the order is accepted.
                actualStartedAt: stage.stage === 'CLASSIFY' ? now : null,
              },
            })
        }
        // Work may have changed since the plan was made: re-check against the current schedule
        // and only commit if the order still meets its pickup without making another order late.
        const evaluation = evaluateOrder(
          await loadScheduleState(tx),
          order.orderId,
          baselineLate,
          now,
        )
        if (!evaluation.feasible)
          fail(
            409,
            'STALE_PLAN',
            'The schedule changed; the plan no longer meets every pickup time',
            {
              estimated_at: evaluation.own?.estimatedAt ?? null,
              affected_orders: evaluation.newlyLate.map(
                ({ orderId, estimatedAt, late }) => ({
                  orderId,
                  estimatedAt,
                  late,
                }),
              ),
              unscheduled_stage_ids: evaluation.unscheduled,
            },
          )
        await applySchedule(tx, evaluation.result, 'NEW_ORDER')
        return tx.laundryOrder.findUniqueOrThrow({
          where: { orderId: order.orderId },
          include: orderInclude,
        })
      },
      { timeout: 20_000 },
    )
    .catch((cause) => {
      // Keep the plan for a retry unless it no longer fits the schedule.
      if (!(cause instanceof ApiError && cause.code === 'STALE_PLAN'))
        planStore.set(planId, stored)
      throw cause
    })
  res.status(201).json(orderResource(await getOrder(created.orderId)))
}
export async function list(req: Request, res: Response) {
  const q = req.query
  const orders = await prisma.laundryOrder.findMany({
    where: {
      ...(q.status ? { status: String(q.status) as any } : {}),
      ...(q.priority ? { priority: Number(q.priority) } : {}),
      ...(q.pickup_from || q.pickup_to
        ? {
            pickupAt: {
              ...(q.pickup_from
                ? { gte: new Date(String(q.pickup_from)) }
                : {}),
              ...(q.pickup_to ? { lte: new Date(String(q.pickup_to)) } : {}),
            },
          }
        : {}),
    },
    include: {
      customer: true,
      batches: true,
      alerts: { where: { status: { not: 'RESOLVED' } } },
    },
    orderBy: [{ priority: 'desc' }, { pickupAt: 'asc' }],
    skip: (Number(q.page ?? 1) - 1) * Number(q.page_size ?? 25),
    take: Number(q.page_size ?? 25),
  })
  res.json(
    orders.map((o) => ({
      order_id: o.orderId,
      customer: o.customer,
      service_type: o.serviceType,
      status: o.status,
      total_weight_kg: Number(o.totalWeightKg),
      total_amount: Number(o.totalAmount),
      pickup_at: o.pickupAt.toISOString(),
      estimated_at: o.estimatedAt.toISOString(),
      priority: o.priority,
      active_alert_count: o.alerts.length,
      batches: o.batches.length,
    })),
  )
}
export async function get(req: Request, res: Response) {
  const order = await getOrder(getId(req.params.orderId))
  if (!order) fail(404, 'NOT_FOUND', 'Order not found')
  res.json(orderResource(order))
}
export async function pickupChange(req: Request, res: Response) {
  const orderId = getId(req.params.orderId)
  const order = await getOrder(orderId)
  if (!order) fail(404, 'NOT_FOUND', 'Order not found')
  if (order.status === 'COMPLETED')
    fail(400, 'INVALID_STATE', 'Order is already completed')
  const body = getBody(req)
  const newPickupAt = getDate(body.new_pickup_at, 'new_pickup_at')
  if (newPickupAt.getTime() === order.pickupAt.getTime())
    fail(400, 'INVALID_INPUT', 'New pickup time must be different')
  const now = new Date()
  // Trial schedule with the new pickup time, compared with the current one: the change is
  // feasible when this order meets it and no order that is on time now becomes late.
  const assess = (state: ScheduleState) => {
    const baselineLate = lateOrderIds(computeSchedule(state, now))
    const evaluation = evaluateOrder(
      withPickup(state, orderId, newPickupAt),
      orderId,
      baselineLate,
      now,
    )
    const earliest = evaluation.feasible
      ? null
      : earliestFeasiblePickup(state, orderId, newPickupAt, baselineLate, now)
    return { baselineLate, evaluation, earliest }
  }

  if (body.preview === true) {
    const { baselineLate, evaluation, earliest } = assess(
      await loadScheduleState(),
    )
    // This order (even when it is already late), plus on-time orders whose plan moves.
    const entries = evaluation.result.affectedOrders.filter(
      (entry) =>
        entry.orderId === orderId ||
        (evaluation.result.changedOrderIds.includes(entry.orderId) &&
          !baselineLate.has(entry.orderId)),
    )
    const described = await describeOrders(entries)
    return res.json({
      feasible: evaluation.feasible,
      affected_orders: described.map((entry) => ({
        ...entry,
        relation: entry.order_id === orderId ? 'changing' : 'rescheduled',
        pickup_at:
          entry.order_id === orderId
            ? newPickupAt.toISOString()
            : entry.pickup_at,
        preexisting_late: baselineLate.has(entry.order_id),
      })),
      unscheduled_stage_ids: evaluation.unscheduled,
      earliest_feasible_pickup: earliest?.toISOString() ?? null,
    })
  }

  const result = await prisma.$transaction(
    async (tx) => {
      const { evaluation, earliest } = assess(await loadScheduleState(tx))
      if (!evaluation.feasible)
        fail(
          422,
          'PICKUP_UNFEASIBLE',
          'No valid schedule meets the requested pickup time',
          {
            earliest_feasible_pickup: earliest?.toISOString() ?? null,
            affected_orders: [
              ...(evaluation.own?.late ? [evaluation.own] : []),
              ...evaluation.newlyLate,
            ].map(({ orderId, estimatedAt, late }) => ({
              orderId,
              estimatedAt,
              late,
            })),
            unscheduled_stage_ids: evaluation.unscheduled,
          },
        )
      await tx.laundryOrder.update({
        where: { orderId },
        data: { pickupAt: newPickupAt },
      })
      const schedule = await applySchedule(
        tx,
        evaluation.result,
        'PICKUP_TIME_CHANGED',
      )
      await tx.appointmentHistory.create({
        data: {
          orderId,
          oldPickupAt: order.pickupAt,
          newPickupAt,
          // The ETA under the new pickup time (the schedule just applied), not the old one.
          estimatedAt: evaluation.own
            ? new Date(evaluation.own.estimatedAt)
            : order.estimatedAt,
          reason: body.reason ?? null,
        },
      })
      return schedule
    },
    { timeout: 20_000 },
  )
  res.json({ order: orderResource(await getOrder(orderId)), schedule: result })
}
export async function reschedule(req: Request, res: Response) {
  const orderId = getId(req.params.orderId)
  const order = await getOrder(orderId)
  if (!order) fail(404, 'NOT_FOUND', 'Order not found')
  const result = await rescheduleAll(getBody(req).reason ?? 'MANUAL')
  res.json({
    order: orderResource(await getOrder(orderId)),
    reason: getBody(req).reason ?? 'MANUAL',
    locked_stage_ids: order.batches.flatMap((b) =>
      b.stages
        .filter((s) => s.status === 'IN_PROGRESS')
        .map((s) => s.batchStageId),
    ),
    schedule: result,
    affected_orders: result.affectedOrders,
    changed_stage_ids: result.changedStageIds,
  })
}
