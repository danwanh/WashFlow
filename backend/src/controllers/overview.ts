import type { Request, Response } from 'express'
import { fail, prisma } from '../services/api.js'

const parseDay = (value: unknown, field: string) => {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value))
    fail(400, 'INVALID_INPUT', `${field} must be YYYY-MM-DD`)
  const date = new Date(`${value}T00:00:00.000Z`)
  if (Number.isNaN(date.getTime())) fail(400, 'INVALID_INPUT', `${field} is invalid`)
  return date
}

export async function get(req: Request, res: Response) {
  const now = new Date()
  const today = now.toISOString().slice(0, 10)
  const from = parseDay(req.query.from ?? today, 'from')
  const toDay = parseDay(req.query.to ?? today, 'to')
  const to = new Date(toDay.getTime() + 24 * 60 * 60 * 1000)
  if (from > toDay) fail(400, 'INVALID_INPUT', 'from must not be after to')
  if (to.getTime() - from.getTime() > 366 * 24 * 60 * 60 * 1000)
    fail(400, 'INVALID_INPUT', 'Date range must not exceed 366 days')

  const orders = await prisma.laundryOrder.findMany({
    where: { pickupAt: { gte: from, lt: to } },
    select: { pickupAt: true, estimatedAt: true, status: true },
    orderBy: { pickupAt: 'asc' },
  })
  const processingStatuses = new Set(['RECEIVED', 'WAITING', 'FOLDING_PACKING'])
  const onTimeCount = orders.filter((order) => order.estimatedAt <= order.pickupAt).length
  const lateCount = orders.length - onTimeCount
  const ordersByDay = new Map<string, number>()
  const pickupPeaks = new Map<number, number>()
  for (const order of orders) {
    const day = order.pickupAt.toISOString().slice(0, 10)
    ordersByDay.set(day, (ordersByDay.get(day) ?? 0) + 1)
    const hour = order.pickupAt.getUTCHours()
    pickupPeaks.set(hour, (pickupPeaks.get(hour) ?? 0) + 1)
  }

  const days: Array<{ label: string; value: number }> = []
  for (let cursor = new Date(from); cursor < to; cursor.setUTCDate(cursor.getUTCDate() + 1)) {
    const label = cursor.toISOString().slice(0, 10)
    days.push({ label, value: ordersByDay.get(label) ?? 0 })
  }
  const peakHours = [...pickupPeaks.keys()].sort((a, b) => a - b)
  res.json({
    from: from.toISOString(),
    to: new Date(to.getTime() - 1).toISOString(),
    kpis: {
      revenue: 0,
      orderCount: orders.length,
      processingCount: orders.filter((order) => processingStatuses.has(order.status)).length,
      onTimeCount,
      lateCount,
    },
    revenueByHour: [],
    appointmentStatus: { onTime: onTimeCount, late: lateCount },
    pickupPeaks: peakHours.map((hour) => ({
      label: `${String(hour).padStart(2, '0')}:00`,
      value: pickupPeaks.get(hour) ?? 0,
    })),
    ordersByDay: days,
  })
}
