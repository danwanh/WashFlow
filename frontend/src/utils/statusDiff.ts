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

const orderStatusLabels: Record<string, string> = {
  RECEIVED: 'Mới tiếp nhận',
  WAITING: 'Đang xử lý',
  FOLDING_PACKING: 'Đang xếp đồ',
  READY: 'Sẵn sàng · chờ gửi tin',
  COMPLETED: 'Đã hoàn tất',
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
  const where = `#${before.order_id} · ${before.group} · ${before.customer}`
  if (before.stage === 'CLASSIFY') return { title: 'Đã phân loại xong', detail: where }
  if (before.stage === 'PACKING') return { title: 'Đã đóng gói xong', detail: where }
  return { title: `Đã lấy đồ khỏi ${before.machine_name ?? 'máy'}`, detail: where }
}

// Notices for the real status changes between two polls of the queue.
export function diffQueue(before: QueueSnapshot, after: QueueSnapshot): Omit<Notice, 'id'>[] {
  const notices: Omit<Notice, 'id'>[] = []

  for (const [batchId, prev] of before.batches) {
    const next = after.batches.get(batchId)
    const where = `#${prev.order_id} · ${prev.group} · ${prev.customer}`
    if (!next || next.batch_stage_id !== prev.batch_stage_id) {
      notices.push({ tone: 'success', ...stageDone(prev) })
      continue
    }
    if (prev.stage_status === next.stage_status) continue
    if (next.stage_status === 'IN_PROGRESS')
      notices.push({
        tone: 'info',
        title: `Đã cho vào ${next.machine_name ?? 'máy'}`,
        detail: where,
      })
    if (next.stage_status === 'MACHINE_FINISHED')
      notices.push({
        tone: 'warning',
        title: `✓ ${next.machine_name ?? 'Máy'} đã chạy xong`,
        detail: `${where} · Lấy đồ ra`,
      })
  }

  for (const [orderId, next] of after.orders) {
    const prev = before.orders.get(orderId)
    if (!prev) {
      notices.push({ tone: 'info', title: `Đơn mới #${orderId}`, detail: next.customer })
    } else if (prev.status !== next.status) {
      notices.push({
        tone: next.status === 'READY' ? 'success' : 'info',
        title: `Đơn #${orderId}: ${orderStatusLabels[next.status] ?? next.status}`,
        detail: `${next.customer} · trước đó: ${orderStatusLabels[prev.status] ?? prev.status}`,
      })
    }
  }
  for (const [orderId, prev] of before.orders)
    if (!after.orders.has(orderId))
      notices.push({
        tone: 'success',
        title: `Đơn #${orderId}: Đã hoàn tất`,
        detail: `${prev.customer} · đã gửi tin cho khách`,
      })

  return notices
}
