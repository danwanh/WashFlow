import type { StageName, StageTiming } from '../api'

export type Task = {
  id: string
  rank: number
  action: string
  customer: string
  group: string
  detail: string
  due: string
  tone: 'blue' | 'amber' | 'slate' | 'green'
  actionType?: 'CLASSIFY' | 'START' | 'MACHINE_FINISHED' | 'UNLOAD' | 'PACK' | 'NOTIFY'
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
  actualEndedAt?: string | null
  timingStatus?: string
  delayMinutes?: number
  remainingMinutes?: number
  timingLabel?: string
}
