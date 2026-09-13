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
})
export async function list(_req: Request, res: Response) {
  res.json(
    (await prisma.machine.findMany({ orderBy: { machineId: 'asc' } })).map(
      view,
    ),
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
