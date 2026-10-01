import { useCallback, useEffect, useRef, useState } from 'react'
import { useQueue } from './useQueue'
import { diffQueue, snapshotQueue, type Notice, type QueueSnapshot } from '../utils/statusDiff'

const NOTICE_MS = 6_000
const MAX_NOTICES = 4

// Watches the shared queue data and turns real order/stage status changes into notices.
// `refresh()` refetches right away (after the user acts) instead of waiting for a server event.
export function useStatusFeed() {
  const [notices, setNotices] = useState<Notice[]>([])
  const { data: queue, refetch } = useQueue()
  const previous = useRef<QueueSnapshot | null>(null)
  const nextId = useRef(1)

  const dismiss = useCallback((id: number) => {
    setNotices((items) => items.filter((item) => item.id !== id))
  }, [])

  const clearAll = useCallback(() => setNotices([]), [])

  const push = useCallback(
    (notice: Omit<Notice, 'id'>) => {
      const added = { ...notice, id: nextId.current++ }
      setNotices((items) => [added, ...items].slice(0, MAX_NOTICES))
      window.setTimeout(() => dismiss(added.id), NOTICE_MS)
    },
    [dismiss],
  )

  // Report what changed whenever the shared queue data changes.
  useEffect(() => {
    if (!queue) return
    const snapshot = snapshotQueue(queue)
    const changes = previous.current ? diffQueue(previous.current, snapshot) : []
    previous.current = snapshot
    for (const change of changes.reverse()) push(change)
  }, [queue, push])

  const refresh = useCallback(async () => {
    await refetch()
  }, [refetch])

  return { notices, dismiss, clearAll, refresh, push, taskCount: queue?.count ?? null }
}
