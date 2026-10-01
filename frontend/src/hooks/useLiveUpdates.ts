import { useQueryClient } from '@tanstack/react-query'
import { useEffect } from 'react'
import { apiUrl } from '../api'
import { QUEUE_KEY } from './useQueue'

// Fired on window when alerts changed on the server; AlertBell reloads on it.
export const ALERTS_CHANGED_EVENT = 'washflow:alerts-changed'

// Listens to the server's change stream (GET /api/events) and refetches what changed, so
// actions from other devices and automatic machine finishes show up within a second.
// Polling stays only as a fallback.
export function useLiveUpdates() {
  const client = useQueryClient()
  useEffect(() => {
    const source = new EventSource(`${apiUrl}/events`)
    const refetch = (topics: string[]) => {
      if (topics.includes('queue')) void client.invalidateQueries({ queryKey: QUEUE_KEY })
      if (topics.includes('alerts')) window.dispatchEvent(new Event(ALERTS_CHANGED_EVENT))
    }
    // Changes may have been missed while disconnected: refetch everything on (re)connect.
    source.onopen = () => refetch(['queue', 'alerts'])
    source.addEventListener('change', (event) => {
      try {
        refetch((JSON.parse((event as MessageEvent<string>).data) as { topics: string[] }).topics)
      } catch {
        refetch(['queue', 'alerts'])
      }
    })
    return () => source.close()
  }, [client])
}
