import { scanAlerts } from './alerts.js'
import { notifyChange } from './events.js'
import { autoFinishMachines } from './workflow.js'

// Background work that depends only on the clock, so it happens even with no client open:
// finish machines whose cycle has elapsed, then refresh the alerts.
export function startTicker() {
  const seconds = Number(process.env.TICK_INTERVAL_SECONDS ?? 10)
  if (!Number.isFinite(seconds) || seconds <= 0) return
  let running = false
  const tick = async () => {
    if (running) return
    running = true
    try {
      await autoFinishMachines()
      const scan = await scanAlerts()
      if (scan.changed.length) notifyChange(['alerts'])
    } catch (error) {
      console.error('Ticker failed', error)
    } finally {
      running = false
    }
  }
  void tick()
  setInterval(() => void tick(), seconds * 1000)
}
