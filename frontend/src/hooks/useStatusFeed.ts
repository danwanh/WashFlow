import { useCallback, useEffect, useRef, useState } from 'react'
import { getQueue } from '../api'
import { diffQueue, snapshotQueue, type Notice, type QueueSnapshot } from '../utils/statusDiff'

const POLL_MS = 5_000
const NOTICE_MS = 6_000
const MAX_NOTICES = 4

// Polls the queue and turns real order/stage status changes into notices.
// `refresh()` checks right away (after the user acts) instead of waiting for the next poll.
export function useStatusFeed() {
  const [notices, setNotices] = useState<Notice[]>([])
  const [taskCount, setTaskCount] = useState<number | null>(null)
  const previous = useRef<QueueSnapshot | null>(null)
  const pending = useRef<Promise<void>>(Promise.resolve())
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

  const refresh = useCallback(() => {
    // Serialize polls so two overlapping responses never report the same change twice.
    pending.current = pending.current.then(async () => {
      try {
        const queue = await getQueue()
        const snapshot = snapshotQueue(queue)
        setTaskCount(queue.count)
        const changes = previous.current ? diffQueue(previous.current, snapshot) : []
        previous.current = snapshot
        for (const change of changes.reverse()) push(change)
      } catch {
        // Pages show their own load errors; a failed poll just waits for the next one.
      }
    })
    return pending.current
  }, [push])

  useEffect(() => {
    void refresh()
    const timer = window.setInterval(() => void refresh(), POLL_MS)
    return () => window.clearInterval(timer)
  }, [refresh])

  return { notices, dismiss, clearAll, refresh, push, taskCount }
}
