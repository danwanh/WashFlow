export type ServiceType = 'WASH' | 'DRY' | 'WASH_DRY'

export type OrderDraftInput = {
  customer: { name: string; phone: string }
  service_type: ServiceType
  items: Array<{ item_type: string; quantity: number; weight_kg: number; note?: string }>
  pickup_at: string
  priority: number
  special_note?: string
}

export type PlanResponse = {
  plan_id: string
  feasible: boolean
  estimated_at: string | null
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
      stage: 'WASH' | 'DRY'
      machineId: number
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
  pickup_at: string
  batches: Array<{ batch_id: number; batch_no: number }>
}

const apiUrl = import.meta.env.VITE_API_URL ?? 'http://localhost:3000/api'

async function request<T>(path: string, init: RequestInit): Promise<T> {
  const response = await fetch(`${apiUrl}${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...init.headers },
  })
  const body = (await response.json()) as T & { error?: { message?: string } }
  if (!response.ok) throw new Error(body.error?.message ?? 'Không thể kết nối máy chủ')
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
