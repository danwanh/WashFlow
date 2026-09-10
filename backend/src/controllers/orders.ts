import type { Request, Response } from 'express'
import { Prisma } from '../../generated/prisma/client.js'
import { buildPlan, type PlanItem, type Service } from '../services/planner.js'
import {
  createPlanId,
  fail,
  getBody,
  getDate,
  getId,
  getOrder,
  orderInclude,
  planStore,
  prisma,
  orderResource,
} from '../services/api.js'
import crypto from 'node:crypto'

export async function plan(req: Request, res: Response) {
  const b = getBody(req)
  if (
    !b.customer?.name ||
    !b.customer?.phone ||
    !Array.isArray(b.items) ||
    !b.items.length
  )
    fail(400, 'INVALID_INPUT', 'Customer and at least one item are required')
  if (!['WASH', 'DRY', 'WASH_DRY'].includes(b.service_type))
    fail(400, 'INVALID_INPUT', 'Invalid service_type')
  const pickupAt = getDate(b.pickup_at, 'pickup_at')
  const items: PlanItem[] = b.items.map((x: any, index: number) => {
    if (
      !x.item_type ||
      !Number.isInteger(x.quantity) ||
      x.quantity <= 0 ||
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
  const machines = await prisma.machine.findMany({
    where: { status: { in: ['AVAILABLE', 'BUSY'] } },
  })
  const result = buildPlan({
    items,
    service: b.service_type as Service,
    pickupAt,
    now: new Date(),
    machines: machines.map((m) => ({
      machineId: m.machineId,
      type: m.type,
      capacityKg: Number(m.capacityKg),
      processingMinutes: m.processingMinutes,
      status: m.status,
    })),
  })
  const planId = createPlanId({ ...b, nonce: crypto.randomUUID() })
  planStore.set(planId, { expires: Date.now() + 600000, input: b, result })
  res.json({
    plan_id: planId,
    feasible: result.feasible,
    estimated_at: result.estimatedAt ?? result.earliestFeasiblePickup,
    pickup_at: pickupAt.toISOString(),
    deadline_buffer_minutes: result.estimatedAt
      ? Math.floor(
          (pickupAt.getTime() - new Date(result.estimatedAt).getTime()) / 60000,
        )
      : null,
    customer: b.customer,
    items: b.items,
    compatibility_groups: [],
    batches: result.batches,
    affected_orders: [],
    warnings: result.warnings,
  })
}
export async function create(req: Request, res: Response) {
  const planId = getBody(req).plan_id
  const stored = planStore.get(planId)
  if (!stored || stored.expires < Date.now())
    fail(409, 'STALE_PLAN', 'Plan is expired or no longer available')
  if (!stored.result.feasible)
    fail(
      422,
      'PICKUP_UNFEASIBLE',
      'No valid schedule meets the requested pickup time',
    )
  const b = stored.input
  const created = await prisma.$transaction(async (tx) => {
    const customer = await tx.customer.create({
      data: { name: b.customer.name, phone: b.customer.phone },
    })
    const order = await tx.laundryOrder.create({
      data: {
        customerId: customer.customerId,
        serviceType: b.service_type,
        status: 'RECEIVED',
        totalWeightKg: new Prisma.Decimal(
          b.items.reduce((sum: number, x: any) => sum + Number(x.weight_kg), 0),
        ),
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
      include: { items: true },
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
            machineId: stage.machineId,
            plannedStartAt: new Date(stage.plannedStartAt),
            plannedEndAt: new Date(stage.plannedEndAt),
          },
        })
    }
    return tx.laundryOrder.findUniqueOrThrow({
      where: { orderId: order.orderId },
      include: orderInclude,
    })
  })
  planStore.delete(planId)
  res.status(201).json(orderResource(created))
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
  const newPickupAt = getDate(getBody(req).new_pickup_at, 'new_pickup_at')
  if (newPickupAt < order.estimatedAt)
    fail(
      422,
      'PICKUP_UNFEASIBLE',
      'No valid schedule meets the requested pickup time',
      { earliest_feasible_pickup: order.estimatedAt },
    )
  const updated = await prisma.$transaction(async (tx) => {
    await tx.appointmentHistory.create({
      data: {
        orderId,
        oldPickupAt: order.pickupAt,
        newPickupAt,
        estimatedAt: order.estimatedAt,
        reason: getBody(req).reason ?? null,
      },
    })
    return tx.laundryOrder.update({
      where: { orderId },
      data: { pickupAt: newPickupAt },
      include: orderInclude,
    })
  })
  res.json({ order: orderResource(updated), schedule: updated.batches })
}
export async function reschedule(req: Request, res: Response) {
  const order = await getOrder(getId(req.params.orderId))
  if (!order) fail(404, 'NOT_FOUND', 'Order not found')
  res.json({
    order: orderResource(order),
    reason: getBody(req).reason ?? 'MANUAL',
    locked_stage_ids: order.batches.flatMap((b) =>
      b.stages
        .filter((s) => s.status === 'IN_PROGRESS')
        .map((s) => s.batchStageId),
    ),
    schedule: order.batches,
  })
}
export async function classification(req: Request, res: Response) {
  const orderId = getId(req.params.orderId)
  const order = await getOrder(orderId)
  if (!order) fail(404, 'NOT_FOUND', 'Order not found')
  const batches = getBody(req).batches
  if (!Array.isArray(batches))
    fail(400, 'INVALID_INPUT', 'batches must be an array')
  for (const p of batches) {
    const batch = order.batches.find((x) => x.batchId === p.batch_id)
    if (!batch) fail(404, 'NOT_FOUND', 'Batch not found')
    if (batch.stages.some((s) => s.status === 'IN_PROGRESS'))
      fail(409, 'STAGE_LOCKED', 'In-progress stages cannot be reclassified')
    const total = p.items.reduce(
      (sum: number, item: any) => sum + Number(item.weight_kg),
      0,
    )
    if (Math.abs(total - Number(batch.weightKg)) > 0.01)
      fail(
        400,
        'INVALID_ALLOCATION',
        'Batch item weights must equal the batch weight',
      )
  }
  const updated = await prisma.$transaction(async (tx) => {
    for (const p of batches) {
      await tx.batchItem.deleteMany({ where: { batchId: p.batch_id } })
      for (const item of p.items)
        await tx.batchItem.create({
          data: {
            batchId: p.batch_id,
            orderItemId: Number(item.order_item_id),
            weightKg: Number(item.weight_kg),
          },
        })
    }
    return tx.laundryOrder.update({
      where: { orderId },
      data: { classifiedAt: new Date(), status: 'WAITING' },
      include: orderInclude,
    })
  })
  res.json(orderResource(updated))
}
