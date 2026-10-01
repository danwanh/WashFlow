import crypto from 'node:crypto'
import { PrismaClient } from '../../generated/prisma/client.js'
import { PrismaPg } from '@prisma/adapter-pg'
import { batchTimings } from './timing.js'

export const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
})
export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details: unknown = {},
  ) {
    super(message)
  }
}
export function fail(
  status: number,
  code: string,
  message: string,
  details?: unknown,
): never {
  throw new ApiError(status, code, message, details)
}
export const getBody = (req: { body: unknown }) =>
  req.body as Record<string, any>
export const getId = (value: unknown) => {
  const parsed = Number(value)
  if (!Number.isInteger(parsed))
    fail(400, 'INVALID_ID', 'ID must be an integer')
  return parsed
}
export const getDate = (value: unknown, field: string) => {
  const parsed = new Date(String(value))
  if (!value || Number.isNaN(parsed.getTime()))
    fail(400, 'INVALID_INPUT', `${field} must be an ISO timestamp`)
  return parsed
}
export const orderInclude = {
  customer: true,
  items: { include: { batchItems: true } },
  batches: { include: { items: true, stages: { include: { machine: true } } } },
  appointments: true,
  notifications: true,
  alerts: { where: { status: { not: 'RESOLVED' } } },
} as const
export const getOrder = (orderId: number) =>
  prisma.laundryOrder.findUnique({ where: { orderId }, include: orderInclude })
export const planStore = new Map<
  string,
  { expires: number; input: any; result: any }
>()
export const createPlanId = (value: unknown) =>
  crypto
    .createHmac(
      'sha256',
      process.env.PLAN_SECRET ?? 'washflow-development-secret',
    )
    .update(JSON.stringify(value))
    .digest('hex')
export function orderResource(order: any) {
  return {
    ...order,
    total_weight_kg: Number(order.totalWeightKg),
    total_amount: Number(order.totalAmount ?? 0),
    pickup_at: order.pickupAt.toISOString(),
    estimated_at: order.estimatedAt.toISOString(),
    created_at: order.createdAt.toISOString(),
    updated_at: order.updatedAt.toISOString(),
    customer_id: order.customerId,
    service_type: order.serviceType,
    special_note: order.specialNote,
    classified_at: order.classifiedAt?.toISOString() ?? null,
    packing_completed_at: order.packingCompletedAt?.toISOString() ?? null,
    ready_at: order.readyAt?.toISOString() ?? null,
    completed_at: order.completedAt?.toISOString() ?? null,
    items: order.items.map((x: any) => ({
      order_item_id: x.orderItemId,
      item_type: x.itemType,
      quantity: x.quantity,
      weight_kg: x.weightKg == null ? null : Number(x.weightKg),
      note: x.note,
      batch_items: x.batchItems,
    })),
    batches: order.batches.map((b: any) => ({
      batch_id: b.batchId,
      order_id: b.orderId,
      batch_no: b.batchNo,
      weight_kg: Number(b.weightKg),
      status: b.status,
      current_stage: b.currentStage,
      estimated_at: b.estimatedAt?.toISOString() ?? null,
      completed_at: b.completedAt?.toISOString() ?? null,
      batch_items: b.items,
      // Workflow order (sorting, washing, drying, packing) with wait/late timing per stage.
      stages: batchTimings<any>(b.stages, Date.now()).map(
        ({ stage: s, timing }) => ({
          batch_stage_id: s.batchStageId,
          stage: s.stage,
          status: s.status,
          machine_id: s.machineId,
          machine_name: s.machine?.name ?? null,
          planned_start_at: s.plannedStartAt?.toISOString() ?? null,
          planned_end_at: s.plannedEndAt?.toISOString() ?? null,
          actual_started_at: s.actualStartedAt?.toISOString() ?? null,
          actual_machine_finished_at:
            s.actualMachineFinishedAt?.toISOString() ?? null,
          actual_ended_at: s.actualEndedAt?.toISOString() ?? null,
          ...timing,
        }),
      ),
    })),
    alerts: order.alerts,
    appointments: order.appointments,
    notifications: order.notifications,
  }
}

// Customer and pickup for schedule entries, as listed in previews and errors.
export async function describeOrders(
  entries: Array<{ orderId: number; estimatedAt: string; late: boolean }>,
) {
  const orders = await prisma.laundryOrder.findMany({
    where: { orderId: { in: entries.map((entry) => entry.orderId) } },
    select: {
      orderId: true,
      pickupAt: true,
      customer: { select: { name: true } },
    },
  })
  return entries.map((entry) => {
    const order = orders.find((item) => item.orderId === entry.orderId)
    return {
      order_id: entry.orderId,
      customer: order?.customer.name ?? 'Không rõ khách hàng',
      pickup_at: order?.pickupAt.toISOString() ?? null,
      estimated_at: entry.estimatedAt,
      late: entry.late,
    }
  })
}
