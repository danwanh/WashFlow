import { Bell, Check, Clock3, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { getAlerts, resolveAlert, scanAlerts, snoozeAlert, type Alert } from '../../api'

const labels: Record<string, string> = {
  LATE_RISK: 'Nguy cơ trễ',
  MACHINE_FINISHED: 'Máy đã chạy xong',
  FORGOTTEN_WAITING: 'Mẻ chờ quá lâu',
  FORGOTTEN_UNLOAD: 'Chưa lấy đồ ra',
  FORGOTTEN_PACKING: 'Chưa xếp đồ',
  FORGOTTEN_NOTIFICATION: 'Chưa gửi tin khách',
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
        <strong>{labels[alert.type] ?? 'Cảnh báo'}</strong>
        <span>
          Đơn #{alert.order_id}
          {alert.batch_id ? ` · Mẻ ${alert.batch_id}` : ''}
        </span>
        <p>{alert.reason}</p>
        <small>{new Date(alert.detected_at).toLocaleString('vi-VN')}</small>
      </div>
      <div className="alert-item-actions">
        {alert.status === 'OPEN' && (
          <button title="Nhắc lại sau 5 phút" onClick={() => void action(snoozeAlert)}>
            <Clock3 size={14} />
          </button>
        )}
        <button title="Đánh dấu đã xử lý" onClick={() => void action(resolveAlert)}>
          <Check size={14} />
        </button>
      </div>
    </article>
  )
}

export function AlertBell() {
  const [alerts, setAlerts] = useState<Alert[]>([])
  const [open, setOpen] = useState(false)

  const refresh = async () => {
    try {
      await scanAlerts()
      setAlerts(await getAlerts())
    } catch {
      // The queue remains usable when alert polling is temporarily unavailable.
    }
  }

  useEffect(() => {
    void refresh()
    const timer = window.setInterval(() => void refresh(), 5_000)
    return () => window.clearInterval(timer)
  }, [])

  return (
    <div className="alert-center">
      {open && (
        <section className="alert-panel" aria-label="Danh sách cảnh báo">
          <header>
            <div>
              <strong>Thông báo</strong>
              <small>{alerts.length} cảnh báo cần chú ý</small>
            </div>
            <button onClick={() => setOpen(false)} aria-label="Đóng thông báo">
              <X size={17} />
            </button>
          </header>
          <div className="alert-panel-list">
            {alerts.length ? (
              alerts.map((alert) => (
                <AlertBellItem key={alert.alert_id} alert={alert} onChange={() => void refresh()} />
              ))
            ) : (
              <p className="alert-empty">Không có cảnh báo đang hoạt động.</p>
            )}
          </div>
        </section>
      )}
      <button
        className={`alert-bell ${alerts.length ? 'has-alerts' : ''}`}
        onClick={() => setOpen((value) => !value)}
        aria-label="Mở thông báo"
      >
        <Bell size={22} />
        {alerts.length > 0 && <b>{alerts.length > 99 ? '99+' : alerts.length}</b>}
      </button>
    </div>
  )
}
