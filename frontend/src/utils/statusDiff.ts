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
  RECEIVED: 'vừa được tiếp nhận',
  WAITING: 'đã phân loại xong, đang giặt sấy',
  FOLDING_PACKING: 'đã giặt sấy xong, chờ xếp đồ',
  READY: 'đã xong, nhớ báo khách đến lấy',
  COMPLETED: 'đã báo khách, hoàn tất',
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
  if (before.stage === 'CLASSIFY') return { title: 'Phân loại xong', detail: where }
  if (before.stage === 'PACKING') return { title: 'Đóng gói xong', detail: where }
  return { title: `Đã lấy đồ ra khỏi ${machineName(before)}`, detail: where }
}

const describe = (batch: BatchState) =>
  `Đơn #${batch.order_id} · ${batch.group} · ${batch.customer}`
const machineName = (batch: BatchState) =>
  batch.machine_name ?? (batch.stage === 'DRY' ? 'máy sấy' : 'máy giặt')

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
        title: `Đã cho đồ vào ${machineName(next)}`,
        detail: where,
      })
    if (next.stage_status === 'MACHINE_FINISHED')
      notices.push({
        tone: 'warning',
        title: `${machineName(next)} đã chạy xong, mời lấy đồ ra`,
        detail: where,
      })
  }

  for (const [orderId, next] of after.orders) {
    const prev = before.orders.get(orderId)
    if (!prev) {
      notices.push({ tone: 'info', title: `Có đơn mới #${orderId}`, detail: next.customer })
    } else if (prev.status !== next.status) {
      notices.push({
        tone: next.status === 'READY' ? 'success' : 'info',
        title: `Đơn #${orderId} ${orderStatusNotices[next.status] ?? 'vừa được cập nhật'}`,
        detail: next.customer,
      })
    }
  }
  for (const [orderId, prev] of before.orders)
    if (!after.orders.has(orderId))
      notices.push({
        tone: 'success',
        title: `Đơn #${orderId} đã báo khách, hoàn tất`,
        detail: prev.customer,
      })

  return notices
}
