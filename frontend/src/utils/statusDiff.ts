import type { QueueResponse, QueueTask } from '../api'

export type Notice = {
  id: number
  tone: 'success' | 'info' | 'warning'
  title: string
  detail: string
}

type BatchState = Pick<
  QueueTask,
  'order_id' | 'batch_stage_id' | 'stage' | 'stage_status' | 'machine_name' | 'group' | 'customer'
>
export type QueueSnapshot = {
  orders: Map<number, { status: string; customer: string }>
  batches: Map<number, BatchState>
}

// What staff see when an order moves to a new status.
const orderStatusNotices: Record<string, string> = {
  RECEIVED: 'was just received',
  WAITING: 'is sorted, now washing/drying',
  FOLDING_PACKING: 'is washed and dried, waiting to be packed',
  READY: 'is done, remember to notify the customer',
  COMPLETED: 'customer notified, completed',
}

export function snapshotQueue(queue: QueueResponse): QueueSnapshot {
  const orders = new Map<number, { status: string; customer: string }>()
  const batches = new Map<number, BatchState>()
  for (const task of queue.tasks) {
    orders.set(task.order_id, { status: task.order_status, customer: task.customer })
    if (task.batch_id !== null)
      batches.set(task.batch_id, {
        order_id: task.order_id,
        batch_stage_id: task.batch_stage_id,
        stage: task.stage,
        stage_status: task.stage_status,
        machine_name: task.machine_name,
        group: task.group,
        customer: task.customer,
      })
  }
  return { orders, batches }
}

// What a batch finished when its current stage moved on (or the batch left the queue).
const stageDone = (before: BatchState) => {
  const where = describe(before)
  if (before.stage === 'CLASSIFY') return { title: 'Sorting done', detail: where }
  if (before.stage === 'PACKING') return { title: 'Packing done', detail: where }
  return { title: `Unloaded ${machineName(before)}`, detail: where }
}

const describe = (batch: BatchState) =>
  `Order #${batch.order_id} · ${batch.group} · ${batch.customer}`
const machineName = (batch: BatchState) =>
  batch.machine_name ?? (batch.stage === 'DRY' ? 'dryer' : 'washer')

// Notices for the real status changes between two polls of the queue.
export function diffQueue(before: QueueSnapshot, after: QueueSnapshot): Omit<Notice, 'id'>[] {
  const notices: Omit<Notice, 'id'>[] = []

  for (const [batchId, prev] of before.batches) {
    const next = after.batches.get(batchId)
    const where = describe(prev)
    if (!next || next.batch_stage_id !== prev.batch_stage_id) {
      notices.push({ tone: 'success', ...stageDone(prev) })
      continue
    }
    if (prev.stage_status === next.stage_status) continue
    if (next.stage_status === 'IN_PROGRESS')
      notices.push({
        tone: 'info',
        title: `Loaded ${machineName(next)}`,
        detail: where,
      })
    if (next.stage_status === 'MACHINE_FINISHED')
      notices.push({
        tone: 'warning',
        title: `${machineName(next)} finished, please unload`,
        detail: where,
      })
  }

  for (const [orderId, next] of after.orders) {
    const prev = before.orders.get(orderId)
    if (!prev) {
      notices.push({ tone: 'info', title: `New order #${orderId}`, detail: next.customer })
    } else if (prev.status !== next.status) {
      notices.push({
        tone: next.status === 'READY' ? 'success' : 'info',
        title: `Order #${orderId} ${orderStatusNotices[next.status] ?? 'was updated'}`,
        detail: next.customer,
      })
    }
  }
  for (const [orderId, prev] of before.orders)
    if (!after.orders.has(orderId))
      notices.push({
        tone: 'success',
        title: `Order #${orderId}: customer notified, completed`,
        detail: prev.customer,
      })

  return notices
}
