export type TimingStage = {
  stage: string
  status: string
  plannedStartAt: Date | null
  plannedEndAt: Date | null
  actualStartedAt: Date | null
  actualMachineFinishedAt: Date | null
  actualEndedAt: Date | null
}
export type StagePhase = 'PLANNED' | 'RUNNING' | 'WAITING_UNLOAD' | 'DONE'
export type TimingStatus =
  | 'ON_TIME'
  | 'APPROACHING'
  | 'LATE'
  | 'COMPLETED_ON_TIME'
  | 'COMPLETED_LATE'

const MINUTE = 60_000
const minuteEnv = (name: string, fallback: number) => {
  const value = Number(process.env[name])
  return Number.isFinite(value) && value >= 0 ? value : fallback
}
export const timingThresholds = () => ({
  approachingMinutes: minuteEnv('STAGE_APPROACHING_THRESHOLD_MINUTES', 5),
  unloadThresholdMinutes: minuteEnv('ALERT_UNLOAD_THRESHOLD_MINUTES', 15),
})

export const stageRank = (stage: string) =>
  ({ CLASSIFY: 0, WASH: 1, DRY: 2, PACKING: 3 })[stage] ?? 9
export const isManualStage = (stage: string) => stage === 'CLASSIFY' || stage === 'PACKING'
const plannedDuration = (stage: TimingStage) =>
  stage.plannedStartAt && stage.plannedEndAt
    ? Math.max(0, stage.plannedEndAt.getTime() - stage.plannedStartAt.getTime())
    : 0
const iso = (value: number | null) => (value === null ? null : new Date(value).toISOString())

// Single source of the wait/late rules shown on queue rows, machines and progress bars.
// Only the batch's next unfinished stage (`current`) is measured; later stages are proposals.
export function stageTiming(
  stage: TimingStage,
  now: number,
  context: { current: boolean; previousEndedAt: Date | null },
  thresholds = timingThresholds(),
) {
  const plannedStart = stage.plannedStartAt?.getTime() ?? null
  const plannedEnd = stage.plannedEndAt?.getTime() ?? null
  const approaching = thresholds.approachingMinutes * MINUTE
  let phase: StagePhase = 'PLANNED'
  let status: TimingStatus = 'ON_TIME'
  let expectedStart = plannedStart
  let expectedEnd = plannedEnd
  let waitingSince: number | null = null
  let lateAt: number | null = null
  let delay = 0
  let remaining = 0
  let label = 'Dự kiến'

  if (stage.status === 'COMPLETED') {
    phase = 'DONE'
    expectedStart = stage.actualStartedAt?.getTime() ?? plannedStart
    expectedEnd = stage.actualEndedAt?.getTime() ?? plannedEnd
    delay =
      expectedEnd !== null && plannedEnd !== null
        ? Math.max(0, Math.round((expectedEnd - plannedEnd) / MINUTE))
        : 0
    status = delay > 0 ? 'COMPLETED_LATE' : 'COMPLETED_ON_TIME'
    label = delay > 0 ? `Xong trễ ${delay} phút` : 'Xong đúng hạn'
  } else if (stage.status === 'MACHINE_FINISHED') {
    phase = 'WAITING_UNLOAD'
    expectedStart = stage.actualStartedAt?.getTime() ?? plannedStart
    expectedEnd = stage.actualMachineFinishedAt?.getTime() ?? plannedEnd
    waitingSince = stage.actualMachineFinishedAt?.getTime() ?? now
    lateAt = waitingSince + thresholds.unloadThresholdMinutes * MINUTE
    delay = Math.max(0, Math.floor((now - lateAt) / MINUTE))
    status = now > lateAt ? 'LATE' : 'ON_TIME'
    label = `Chờ dỡ ${Math.max(0, Math.floor((now - waitingSince) / MINUTE))} phút`
  } else if (stage.status === 'IN_PROGRESS') {
    phase = 'RUNNING'
    expectedStart = stage.actualStartedAt?.getTime() ?? plannedStart
    expectedEnd =
      stage.actualStartedAt !== null
        ? stage.actualStartedAt.getTime() + plannedDuration(stage)
        : plannedEnd
    lateAt = expectedEnd
    if (expectedEnd !== null && now > expectedEnd) {
      status = 'LATE'
      delay = Math.ceil((now - expectedEnd) / MINUTE)
      label = `Trễ công đoạn ${delay} phút`
    } else {
      remaining = expectedEnd === null ? 0 : Math.ceil((expectedEnd - now) / MINUTE)
      status = expectedEnd !== null && expectedEnd - now <= approaching ? 'APPROACHING' : 'ON_TIME'
      label = `Còn ${remaining} phút`
    }
  } else if (context.current) {
    // Machine stages are late once their planned start passes; manual stages once their planned end passes.
    waitingSince =
      stage.actualStartedAt?.getTime() ?? context.previousEndedAt?.getTime() ?? null
    lateAt = isManualStage(stage.stage) ? plannedEnd : plannedStart
    if (lateAt !== null && now > lateAt) {
      status = 'LATE'
      delay = Math.ceil((now - lateAt) / MINUTE)
      label = `Trễ công đoạn ${delay} phút`
    } else {
      remaining = lateAt === null ? 0 : Math.ceil((lateAt - now) / MINUTE)
      status = lateAt !== null && lateAt - now <= approaching ? 'APPROACHING' : 'ON_TIME'
      label = isManualStage(stage.stage)
        ? waitingSince !== null
          ? `Chờ ${Math.max(0, Math.floor((now - waitingSince) / MINUTE))} phút`
          : `Còn ${remaining} phút`
        : `Vào máy sau ${remaining} phút`
    }
  }

  return {
    phase,
    timing_status: status,
    expected_start_at: iso(expectedStart),
    expected_end_at: iso(expectedEnd),
    waiting_since: iso(waitingSince),
    late_at: iso(lateAt),
    approaching_at:
      lateAt !== null && phase !== 'WAITING_UNLOAD' ? iso(lateAt - approaching) : null,
    delay_minutes: delay,
    remaining_minutes: remaining,
    timing_label: label,
  }
}

// Timing for every stage of a batch, in workflow order.
export function batchTimings<T extends TimingStage>(stages: T[], now: number) {
  const ordered = [...stages].sort((a, b) => stageRank(a.stage) - stageRank(b.stage))
  const currentIndex = ordered.findIndex((stage) => stage.status !== 'COMPLETED')
  return ordered.map((stage, index) => ({
    stage,
    timing: stageTiming(stage, now, {
      current: index === currentIndex,
      previousEndedAt: index > 0 ? (ordered[index - 1]!.actualEndedAt ?? null) : null,
    }),
  }))
}
