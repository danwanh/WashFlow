import type { Request, Response } from 'express'
import {
  fail,
  getBody,
  getId,
  getOrder,
  orderResource,
} from '../services/api.js'
import { sendNotification, updateStage } from '../services/workflow.js'

export async function stage(req: Request, res: Response) {
  const action = req.path.endsWith('/start')
    ? 'start'
    : req.path.endsWith('machine-finished')
      ? 'finished'
      : 'unload'
  const requestedMachineId = getBody(req).machine_id
  const order = await updateStage(
    getId(req.params.batchId),
    getId(req.params.stageId),
    action,
    requestedMachineId === undefined ? undefined : Number(requestedMachineId),
  )
  res.json(orderResource(order))
}

export async function draft(req: Request, res: Response) {
  const order = await getOrder(getId(req.params.orderId))
  if (!order) fail(404, 'NOT_FOUND', 'Order not found')
  if (order.status !== 'READY') fail(400, 'INVALID_STATE', 'Order is not ready')
  res.json({
    type: 'READY_FOR_PICKUP',
    channel: 'SMS',
    content: `Your laundry order #${order.orderId} is ready for pickup.`,
  })
}

export async function notify(req: Request, res: Response) {
  const result = await sendNotification(getId(req.params.orderId), getBody(req))
  if (!result.sent)
    return res.status(502).json({
      error: {
        code: 'NOTIFICATION_FAILED',
        message: 'Notification delivery failed',
        details: orderResource(result.order),
      },
    })
  res.json(orderResource(result.order))
}
