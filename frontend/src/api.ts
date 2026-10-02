export type ServiceType = 'WASH' | 'DRY' | 'WASH_DRY'

export type OrderDraftInput = {
  customer: { name: string; phone: string }
  service_type: ServiceType
  items: Array<{ item_type: string; quantity: number; weight_kg: number; note?: string }>
  pickup_at: string
  priority: number
  total_amount?: number
  special_note?: string
}

export type PlanResponse = {
  plan_id: string
  feasible: boolean
  estimated_at: string | null
  earliest_feasible_pickup: string | null
  affected_orders: Array<{
    order_id: number
    customer: string
    pickup_at: string | null
    estimated_at: string
    late: boolean
  }>
  compatibility_groups: Array<{
    group: string
    itemIndices: number[]
    totalWeightKg: number
  }>
  batches: Array<{
    batchNo: number
    weightKg: number
    group: string
    items: Array<{ itemIndex: number; weightKg: number }>
    stages: Array<{
      stage: 'CLASSIFY' | 'WASH' | 'DRY' | 'PACKING'
      machineId: number | null
      plannedStartAt: string
      plannedEndAt: string
    }>
  }>
  warnings: string[]
}

export type CreatedOrder = {
  order_id: number
  customer: { name: string; phone: string }
  total_weight_kg: number
  total_amount: number
  pickup_at: string
  batches: Array<{ batch_id: number; batch_no: number }>
}

// Wait/late timing computed by backend/src/services/timing.ts; utils/timing.ts
// refreshes the minute counts every second from these timestamps.
export type StageTiming = {
  phase: 'PLANNED' | 'RUNNING' | 'WAITING_UNLOAD' | 'DONE'
  timing_status: 'ON_TIME' | 'APPROACHING' | 'LATE' | 'COMPLETED_ON_TIME' | 'COMPLETED_LATE'
  expected_start_at: string | null
  expected_end_at: string | null
  waiting_since: string | null
  late_at: string | null
  approaching_at: string | null
  delay_minutes: number
  remaining_minutes: number
  timing_label: string
}

export type StageName = 'CLASSIFY' | 'WASH' | 'DRY' | 'PACKING'

export type QueueTask = StageTiming & {
  stage?: StageName
  order_late_minutes: number
  actual_ended_at?: string | null
  order_id: number
  batch_id: number | null
  batch_stage_id: number | null
  rank: number
  action: string
  action_type: 'CLASSIFY' | 'START' | 'MACHINE_FINISHED' | 'UNLOAD' | 'PACK' | 'NOTIFY'
  customer: string
  group: string
  detail: string
  due: string
  batch_status: string | null
  order_status: string
  stage_status?: string | null
  priority: number
  slack_minutes: number | null
  machine_id: number | null
  machine_name: string | null
  machine_type?: 'WASHER' | 'DRYER'
  button: string | null
  alert_count: number
  weight_kg: number | null
  estimated_at: string
  planned_start_at: string | null
  planned_end_at: string | null
  actual_started_at: string | null
  actual_machine_finished_at: string | null
}

export type QueueResponse = {
  now: string
  count: number
  tasks: QueueTask[]
  machines: Array<{
    machine_id: number
    name: string
    type: 'WASHER' | 'DRYER'
    status: 'AVAILABLE' | 'BUSY' | 'MAINTENANCE'
    capacity_kg: number
    processing_minutes: number
    active_task: QueueTask | null
  }>
}

export type OrderSummary = {
  order_id: number
  customer: { name: string; phone: string }
  service_type: ServiceType
  status: string
  total_weight_kg: number
  total_amount: number
  pickup_at: string
  estimated_at: string
  priority: number
  active_alert_count: number
  batches: number
}

export type Machine = {
  machine_id: number
  name: string
  type: 'WASHER' | 'DRYER'
  status: 'AVAILABLE' | 'BUSY' | 'MAINTENANCE'
  capacity_kg: number
  processing_minutes: number
  updated_at: string
  active_stage: {
    batch_stage_id: number
    stage: string
    status: string
    order_id: number | null
    customer: string | null
    planned_end_at: string | null
  } | null
}

export type OverviewResponse = {
  from: string
  to: string
  kpis: {
    revenue: number
    orderCount: number
    processingCount: number
    onTimeCount: number
    lateCount: number
  }
  revenueByHour: Array<{ label: string; value: number }>
  appointmentStatus: { onTime: number; late: number }
  pickupPeaks: Array<{ label: string; value: number }>
  ordersByDay: Array<{ label: string; value: number }>
}

export type Alert = {
  alert_id: number
  order_id: number
  batch_id: number | null
  type: string
  severity: string
  status: 'OPEN' | 'SNOOZED' | 'RESOLVED'
  reason: string
  detected_at: string
  snoozed_until: string | null
  resolved_at: string | null
}

export type OrderDetails = {
  order_id: number
  customer: { name: string; phone: string }
  service_type: ServiceType
  status: string
  total_weight_kg: number
  pickup_at: string
  estimated_at: string
  priority: number
  created_at: string
  classified_at: string | null
  packing_completed_at: string | null
  ready_at: string | null
  completed_at: string | null
  items: Array<{
    order_item_id: number
    item_type: string
    quantity: number
    weight_kg: number | null
  }>
  batches: Array<{
    batch_id: number
    batch_no: number
    weight_kg: number
    status: string
    current_stage: string | null
    batch_items: Array<{ order_item_id: number; weight_kg: number }>
    stages: Array<
      StageTiming & {
        batch_stage_id: number
        stage: StageName
        status: string
        machine_id: number | null
        machine_name: string | null
        planned_start_at: string | null
        planned_end_at: string | null
        actual_started_at: string | null
        actual_machine_finished_at: string | null
        actual_ended_at: string | null
      }
    >
  }>
}

export type PickupChangeResponse = {
  order: OrderDetails
  schedule: {
    affectedOrders: Array<{ orderId: number; estimatedAt: string; late: boolean }>
    changedStageIds: number[]
    lockedStageIds: number[]
  }
}
export type PickupPreviewResponse = {
  feasible: boolean
  affected_orders: Array<{
    order_id: number
    customer: string
    pickup_at: string | null
    estimated_at: string
    late: boolean
    preexisting_late?: boolean
    relation?: 'changing' | 'rescheduled' | 'affected'
  }>
  unscheduled_stage_ids: number[]
  earliest_feasible_pickup: string | null
}

export const apiUrl = import.meta.env.VITE_API_URL ?? 'http://localhost:3000/api'

async function request<T>(path: string, init: RequestInit): Promise<T> {
  let response: Response
  try {
    response = await fetch(`${apiUrl}${path}`, {
      ...init,
      headers: { 'Content-Type': 'application/json', ...init.headers },
    })
  } catch {
    throw new Error('Không thể kết nối máy chủ. Vui lòng thử lại.')
  }
  const body = (await response.json().catch(() => ({}))) as T & {
    error?: { code?: string; message?: string; details?: unknown }
  }
  if (!response.ok) {
    const messages: Record<string, string> = {
      MACHINE_UNAVAILABLE: 'Máy không phù hợp hoặc đang được sử dụng',
      INVALID_STATE: 'Tác vụ chưa sẵn sàng để thực hiện',
      STAGE_LOCKED: 'Tác vụ đang chạy và không thể thay đổi',
      NOTIFICATION_FAILED: 'Không gửi được thông báo cho khách',
      NOT_FOUND: 'Không tìm thấy dữ liệu tác vụ',
      PICKUP_UNFEASIBLE: 'Giờ hẹn mới không khả thi với lịch xử lý hiện tại',
      STALE_PLAN:
        'Lịch xử lý đã thay đổi, kế hoạch không còn kịp giờ hẹn. Vui lòng lập lại kế hoạch.',
    }
    const error = new Error(
      messages[body.error?.code ?? ''] ?? 'Không thể cập nhật dữ liệu. Vui lòng thử lại.',
    ) as Error & { code?: string; details?: unknown }
    error.code = body.error?.code
    error.details = body.error?.details
    throw error
  }
  return body
}

export function previewOrder(input: OrderDraftInput) {
  return request<PlanResponse>('/orders/plan', { method: 'POST', body: JSON.stringify(input) })
}

export function createOrder(planId: string) {
  return request<CreatedOrder>('/orders', {
    method: 'POST',
    body: JSON.stringify({ plan_id: planId }),
  })
}

export function getQueue() {
  return request<QueueResponse>('/queue', { method: 'GET' })
}

export function getOrders() {
  return request<OrderSummary[]>('/orders', { method: 'GET' })
}

export function getMachines() {
  return request<Machine[]>('/machines', { method: 'GET' })
}

// Staff only switch a machine between in service and maintenance; BUSY follows the batches.
export function updateMachineStatus(machineId: number, status: 'AVAILABLE' | 'MAINTENANCE') {
  return request<Machine>(`/machines/${machineId}`, {
    method: 'PATCH',
    body: JSON.stringify({ status }),
  })
}

export type MaintenanceStage = {
  order_id: number
  customer: string
  batch_id: number
  batch_stage_id: number
  stage: 'CLASSIFY' | 'WASH' | 'DRY' | 'PACKING'
  new_machine_name: string | null
  new_planned_start_at: string | null
}

export type MaintenancePreview = {
  stopped: MaintenanceStage | null
  moved: MaintenanceStage[]
  unscheduled: MaintenanceStage[]
  late_orders: Array<{
    order_id: number
    customer: string
    pickup_at: string | null
    estimated_at: string
    late: boolean
  }>
}

// What putting the machine under maintenance would do; nothing is saved.
export function previewMachineMaintenance(machineId: number) {
  return request<MaintenancePreview>(`/machines/${machineId}`, {
    method: 'PATCH',
    body: JSON.stringify({ status: 'MAINTENANCE', preview: true }),
  })
}

export function getOverview(from: string, to: string) {
  return request<OverviewResponse>(`/overview?from=${from}&to=${to}`, { method: 'GET' })
}

export function scanAlerts() {
  return request<{ scannedAt: string; changed: Alert[] }>('/alerts/scan', {
    method: 'POST',
    body: JSON.stringify({}),
  })
}

export function getAlerts() {
  return request<Alert[]>('/alerts?status=OPEN,SNOOZED', { method: 'GET' })
}

export function snoozeAlert(alertId: number) {
  return request<Alert>(`/alerts/${alertId}/snooze`, {
    method: 'POST',
    body: JSON.stringify({}),
  })
}

export function resolveAlert(alertId: number) {
  return request<Alert>(`/alerts/${alertId}/resolve`, {
    method: 'POST',
    body: JSON.stringify({}),
  })
}

export function getOrder(orderId: number) {
  return request<OrderDetails>(`/orders/${orderId}`, { method: 'GET' })
}

export function changePickupTime(orderId: number, newPickupAt: string) {
  return request<PickupChangeResponse>(`/orders/${orderId}/pickup-change`, {
    method: 'POST',
    body: JSON.stringify({ new_pickup_at: newPickupAt }),
  })
}

export function previewPickupTime(orderId: number, newPickupAt: string) {
  return request<PickupPreviewResponse>(`/orders/${orderId}/pickup-change`, {
    method: 'POST',
    body: JSON.stringify({ new_pickup_at: newPickupAt, preview: true }),
  })
}

export function updateStage(
  task: { batchId?: number | null; batchStageId?: number | null },
  action: 'start' | 'machine-finished' | 'unload',
  machineId?: number,
) {
  return request(`/batches/${task.batchId}/stages/${task.batchStageId}/${action}`, {
    method: 'POST',
    body: JSON.stringify(machineId === undefined ? {} : { machine_id: machineId }),
  })
}

export function draftReadyNotification(orderId: number) {
  return request<{ type: string; channel: string; content: string }>(
    `/orders/${orderId}/notifications/draft`,
    { method: 'POST', body: JSON.stringify({}) },
  )
}

export function sendReadyNotification(orderId: number, content: string) {
  return request(`/orders/${orderId}/notifications`, {
    method: 'POST',
    body: JSON.stringify({
      type: 'READY_FOR_PICKUP',
      channel: 'SMS',
      content,
    }),
  })
}
