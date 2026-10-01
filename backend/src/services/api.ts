import crypto from 'node:crypto'
import { PrismaClient } from '../../generated/prisma/client.js'
import { PrismaPg } from '@prisma/adapter-pg'

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
const timingStatus = (stage: any) => {
  const now = Date.now()
  const end = stage.plannedEndAt?.getTime() ?? now
  const actual = stage.actualEndedAt?.getTime()
  if (actual) return actual > end ? 'COMPLETED_LATE' : 'COMPLETED_ON_TIME'
  return now > end ? 'LATE' : end - now <= 5 * 60_000 ? 'APPROACHING' : 'ON_TIME'
}
const delayMinutes = (stage: any) => {
  const end = stage.plannedEndAt?.getTime() ?? Date.now()
  return Math.max(0, Math.round(((stage.actualEndedAt?.getTime() ?? Date.now()) - end) / 60000))
}
const remainingMinutes = (stage: any) =>
  Math.max(0, Math.ceil(((stage.plannedEndAt?.getTime() ?? Date.now()) - Date.now()) / 60000))
const timingLabel = (stage: any) => {
  const status = timingStatus(stage)
  if (status === 'LATE' || status === 'COMPLETED_LATE') return `Đã trễ ${delayMinutes(stage)} phút`
  if (status === 'APPROACHING') return `Sắp trễ sau ${remainingMinutes(stage)} phút`
  return stage.actualEndedAt ? 'Hoàn tất đúng kế hoạch' : `Còn ${remainingMinutes(stage)} phút`
}
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
        stages: b.stages.map((s: any) => ({
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
         timing_status: timingStatus(s),
         delay_minutes: delayMinutes(s),
         remaining_minutes: remainingMinutes(s),
         timing_label: timingLabel(s),
       })),
    })),
    alerts: order.alerts,
    appointments: order.appointments,
    notifications: order.notifications,
  }
}
