export type Task = {
  id: string
  rank: number
  action: string
  customer: string
  group: string
  detail: string
  due: string
  tone: 'blue' | 'amber' | 'slate'
  badge?: string
  companion?: string
  button?: string
  orderId?: number
  batchId?: number | null
  batchStageId?: number | null
  stageStatus?: string
  machineId?: number | null
  machineType?: 'WASHER' | 'DRYER'
  slackMinutes?: number | null
  weightKg?: number | null
  estimatedAt?: string
  dueAt?: string
  plannedStartAt?: string | null
  plannedEndAt?: string | null
  actualStartedAt?: string | null
  actualMachineFinishedAt?: string | null
}
