import type { StageTiming } from '../api'

export type LiveStatus = StageTiming['timing_status']

const MINUTE = 60_000
const ms = (value: string | null | undefined) => (value ? new Date(value).getTime() : null)

export const formatMinutes = (minutes: number) => {
  const value = Math.max(0, minutes)
  if (value < 60) return `${value} phút`
  const hours = Math.floor(value / 60)
  const rest = value % 60
  return rest ? `${hours} giờ ${rest} phút` : `${hours} giờ`
}

export const formatClock = (value: string | null | undefined) =>
  value
    ? new Date(value).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })
    : '--:--'

// Re-derives the backend timing (backend/src/services/timing.ts) against the client
// clock so labels count down every second instead of on every queue refresh.
export function liveTiming(
  timing: StageTiming | undefined,
  now: number,
  stage?: string,
): { status: LiveStatus; label: string } | null {
  if (!timing) return null
  if (timing.phase === 'DONE')
    return {
      status: timing.timing_status,
      label:
        timing.delay_minutes > 0
          ? `Xong trễ ${formatMinutes(timing.delay_minutes)}`
          : timing.timing_label,
    }
  const lateAt = ms(timing.late_at)
  const approachingAt = ms(timing.approaching_at)
  const status: LiveStatus =
    lateAt !== null && now > lateAt
      ? 'LATE'
      : approachingAt !== null && now >= approachingAt
        ? 'APPROACHING'
        : 'ON_TIME'
  const since = ms(timing.waiting_since)
  const overdue = lateAt === null ? 0 : Math.ceil((now - lateAt) / MINUTE)
  const until = (target: number | null) =>
    target === null ? 0 : Math.max(0, Math.ceil((target - now) / MINUTE))
  const waited = since === null ? 0 : Math.max(0, Math.floor((now - since) / MINUTE))

  if (timing.phase === 'WAITING_UNLOAD') return { status, label: `Chờ dỡ ${formatMinutes(waited)}` }
  if (timing.phase === 'RUNNING')
    return status === 'LATE'
      ? { status, label: `Trễ công đoạn ${formatMinutes(overdue)}` }
      : { status, label: `Còn ${formatMinutes(until(ms(timing.expected_end_at)))}` }
  // PLANNED
  if (!stage) return { status, label: `Chờ gửi tin ${formatMinutes(waited)}` }
  if (lateAt === null) return { status: 'ON_TIME', label: 'Dự kiến' }
  if (stage === 'CLASSIFY' || stage === 'PACKING') {
    if (status === 'LATE') return { status, label: `Trễ công đoạn ${formatMinutes(overdue)}` }
    return {
      status,
      label:
        since !== null ? `Chờ ${formatMinutes(waited)}` : `Còn ${formatMinutes(until(lateAt))}`,
    }
  }
  return status === 'LATE'
    ? { status, label: `Trễ công đoạn ${formatMinutes(overdue)}` }
    : { status, label: `Vào máy sau ${formatMinutes(until(lateAt))}` }
}

export const statusClass = (status: LiveStatus | undefined) =>
  status === 'LATE' || status === 'COMPLETED_LATE'
    ? 'late'
    : status === 'APPROACHING'
      ? 'approaching'
      : ''
