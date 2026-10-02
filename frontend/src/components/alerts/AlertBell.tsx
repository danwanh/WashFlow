import { Bell, Check, Clock3, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { getAlerts, resolveAlert, snoozeAlert, type Alert } from '../../api'
export type { Alert } from '../../api'

const labels: Record<string, string> = {
  LATE_RISK: 'Late risk',
  MACHINE_FINISHED: 'Machine finished',
  FORGOTTEN_WAITING: 'Batch waiting too long',
  FORGOTTEN_UNLOAD: 'Not unloaded',
  FORGOTTEN_PACKING: 'Not packed',
  FORGOTTEN_NOTIFICATION: 'Customer not notified',
  STAGE_APPROACHING: 'Stage almost late',
  STAGE_LATE: 'Stage late',
}

const actionLabels: Record<string, string> = {
  LATE_RISK: 'View late order',
  MACHINE_FINISHED: 'Unload',
  FORGOTTEN_WAITING: 'Load washer',
  FORGOTTEN_UNLOAD: 'Unload',
  FORGOTTEN_PACKING: 'Pack',
  FORGOTTEN_NOTIFICATION: 'Notify customer',
  STAGE_APPROACHING: 'View stage',
  STAGE_LATE: 'View stage',
}

function AlertBellItem({ alert, onChange }: { alert: Alert; onChange: () => void }) {
  const action = async (callback: (id: number) => Promise<Alert>) => {
    await callback(alert.alert_id)
    onChange()
  }
  return (
    <article className={`alert-item ${alert.severity.toLowerCase()}`}>
      <div className="alert-item-icon">
        <Bell size={15} />
      </div>
      <div className="alert-item-copy">
        <strong>{labels[alert.type] ?? 'Alert'}</strong>
        <span>
          Order #{alert.order_id}
          {alert.batch_id ? ` · Batch ${alert.batch_id}` : ''}
        </span>
        <p>{alert.reason}</p>
        <small>{new Date(alert.detected_at).toLocaleString('en-GB')}</small>
      </div>
      <div className="alert-item-actions">
        {alert.status === 'OPEN' && (
          <button title="Remind me in 5 minutes" onClick={() => void action(snoozeAlert)}>
            <Clock3 size={14} />
          </button>
        )}
        <button title="Mark as resolved" onClick={() => void action(resolveAlert)}>
          <Check size={14} />
        </button>
      </div>
    </article>
  )
}

export function AlertBell({
  onAction,
  dismissSignal = 0,
}: {
  onAction?: (alert: Alert) => void
  // Bumped by the developer "close all" button: drops the current popup and every
  // pending one locally (alert data is not changed).
  dismissSignal?: number
}) {
  const [alerts, setAlerts] = useState<Alert[]>([])
  const [open, setOpen] = useState(false)
  const [popupAlert, setPopupAlert] = useState<Alert | null>(null)
  const shownAlerts = useState(() => new Set<number>())[0]
  useEffect(() => {
    if (!dismissSignal) return
    for (const alert of alerts) shownAlerts.add(alert.alert_id)
    setPopupAlert(null)
  }, [dismissSignal])

  const refresh = async () => {
    try {
      // The server scans alerts on its own timer; the client only reads them.
      const next = await getAlerts()
      setAlerts(next)
      const candidate = next.find((alert) => !shownAlerts.has(alert.alert_id))
      if (candidate) {
        shownAlerts.add(candidate.alert_id)
        setPopupAlert(candidate)
      }
    } catch {
      // The queue remains usable when alert polling is temporarily unavailable.
    }
  }

  useEffect(() => {
    void refresh()
    const timer = window.setInterval(() => void refresh(), 5_000)
    return () => window.clearInterval(timer)
  }, [])

  const snooze = async () => {
    if (!popupAlert) return
    await snoozeAlert(popupAlert.alert_id)
    setPopupAlert(null)
    void refresh()
  }

  return (
    <div className="alert-center">
      {popupAlert && (
        <div className="alert-modal-backdrop" role="presentation">
          <section
            className={`alert-modal ${popupAlert.severity.toLowerCase()}`}
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="alert-modal-title"
          >
            <div className="alert-modal-icon">
              <Bell size={23} />
            </div>
            <small>OPERATIONS ALERT</small>
            <h2 id="alert-modal-title">{labels[popupAlert.type] ?? 'Alert'}</h2>
            <p>
              Order #{popupAlert.order_id}
              {popupAlert.batch_id ? ` · Batch ${popupAlert.batch_id}` : ''}
            </p>
            <strong>{popupAlert.reason}</strong>
            <div className="alert-modal-actions">
              <button
                className="secondary"
                onClick={() => {
                  onAction?.(popupAlert)
                  setPopupAlert(null)
                }}
              >
                {actionLabels[popupAlert.type] ?? 'Handle order'}
              </button>
              <button className="primary" onClick={() => void snooze()}>
                <Clock3 size={15} /> Remind me in 5 minutes
              </button>
            </div>
          </section>
        </div>
      )}
      {open && (
        <section className="alert-panel" aria-label="Alert list">
          <header>
            <div>
              <strong>Notifications</strong>
              <small>{alerts.length} alerts need attention</small>
            </div>
            <button onClick={() => setOpen(false)} aria-label="Close notifications">
              <X size={17} />
            </button>
          </header>
          <div className="alert-panel-list">
            {alerts.length ? (
              alerts.map((alert) => (
                <AlertBellItem key={alert.alert_id} alert={alert} onChange={() => void refresh()} />
              ))
            ) : (
              <p className="alert-empty">No active alerts.</p>
            )}
          </div>
        </section>
      )}
      <button
        className={`alert-bell ${alerts.length ? 'has-alerts' : ''}`}
        onClick={() => setOpen((value) => !value)}
        aria-label="Open notifications"
      >
        <Bell size={22} />
        {alerts.length > 0 && <b>{alerts.length > 99 ? '99+' : alerts.length}</b>}
      </button>
    </div>
  )
}
