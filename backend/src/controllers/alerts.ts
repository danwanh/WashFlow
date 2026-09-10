import type { Request, Response } from 'express'
import { fail, getId, prisma } from '../services/api.js'
export async function list(req: Request, res: Response) {
  const q = req.query
  const alerts = await prisma.alert.findMany({
    where: {
      ...(q.status ? { status: String(q.status) as any } : {}),
      ...(q.severity ? { severity: String(q.severity) } : {}),
      ...(q.type ? { type: String(q.type) } : {}),
      ...(q.order_id ? { orderId: Number(q.order_id) } : {}),
      ...(q.batch_id ? { batchId: Number(q.batch_id) } : {}),
    },
    orderBy: { detectedAt: 'desc' },
  })
  res.json(alerts)
}
export async function snooze(req: Request, res: Response) {
  const alert = await prisma.alert
    .update({
      where: { alertId: getId(req.params.alertId) },
      data: { status: 'SNOOZED', snoozedUntil: new Date(Date.now() + 300000) },
    })
    .catch(() => fail(404, 'NOT_FOUND', 'Alert not found'))
  res.json(alert)
}
export async function resolve(req: Request, res: Response) {
  const alert = await prisma.alert
    .update({
      where: { alertId: getId(req.params.alertId) },
      data: { status: 'RESOLVED', resolvedAt: new Date() },
    })
    .catch(() => fail(404, 'NOT_FOUND', 'Alert not found'))
  res.json(alert)
}
