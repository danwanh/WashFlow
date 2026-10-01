import { useQuery } from '@tanstack/react-query'
import { getQueue } from '../api'

export const QUEUE_KEY = ['queue'] as const

// One shared fetch of /api/queue for the queue page, the status feed and the topbar badge.
// Server change events (useLiveUpdates) refetch it; polling is only a fallback.
export function useQueue() {
  return useQuery({ queryKey: QUEUE_KEY, queryFn: getQueue, refetchInterval: 60_000 })
}
