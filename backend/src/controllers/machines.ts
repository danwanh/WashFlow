import type { Request, Response } from 'express'
import { fail, getBody, getId, prisma } from '../services/api.js'
import { rescheduleAll } from '../services/rescheduler.js'
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
    (await prisma.machine.findMany({
      orderBy: { machineId: 'asc' },
      include: {
        stages: {
          where: { status: { in: ['IN_PROGRESS', 'MACHINE_FINISHED'] } },
          orderBy: { plannedEndAt: 'asc' },
          take: 1,
          include: { batch: { include: { order: { include: { customer: true } } } } },
        },
      },
    })).map(view),
  )
}
export async function update(req: Request, res: Response) {
  const machine = await prisma.machine
    .update({
      where: { machineId: getId(req.params.machineId) },
      data: { status: getBody(req).status },
    })
    .catch(() => fail(404, 'NOT_FOUND', 'Machine not found'))
  await rescheduleAll(
    machine.status === 'AVAILABLE' ? 'MACHINE_RETURNED' : 'MACHINE_FAILURE',
  )
  res.json(view(machine))
}
