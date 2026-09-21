import { Activity, CheckCircle2, CircleOff, Wrench } from 'lucide-react'

function MachineIcon({ tone }: { tone: string }) {
  const color =
    tone === 'blue'
      ? '#0284c7'
      : tone === 'green'
        ? '#059669'
        : tone === 'amber'
          ? '#f59e0b'
          : '#cbd5e1'
  return (
    <svg className="machine-icon" viewBox="0 0 72 78" fill="none" aria-hidden="true">
      <rect x="8" y="4" width="56" height="70" rx="9" stroke="currentColor" strokeWidth="2.5" />
      <circle cx="19" cy="15" r="3" fill="currentColor" />
      <circle cx="28" cy="15" r="3" fill="currentColor" opacity=".72" />
      <rect x="39" y="12" width="15" height="6" rx="3" fill="currentColor" opacity=".3" />
      <circle cx="36" cy="46" r="19" stroke="currentColor" strokeWidth="2.5" />
      <circle cx="36" cy="46" r="13" stroke="currentColor" strokeWidth="1.5" opacity=".55" />
      {tone === 'green' ? (
        <path
          d="M28 46l5 5 11-12"
          stroke={color}
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="2.8"
        />
      ) : (
        <circle
          cx="36"
          cy="46"
          r="16"
          stroke={color}
          strokeDasharray={tone === 'empty' ? undefined : '3 4'}
          strokeWidth="1.4"
          opacity=".9"
        />
      )}
    </svg>
  )
}

export function Card({
  name,
  capacity,
  state,
  tone,
  detail,
  time,
  action,
  onAction,
  status,
  onStatusChange,
}: {
  name: string
  capacity: string
  state: string
  tone: string
  detail: string
  time?: string
  action?: string
  onAction?: () => void
  status?: string
  onStatusChange?: (status: string) => void
}) {
  const statusMeta: Record<string, { label: string; icon: React.ReactNode }> = {
    AVAILABLE: { label: 'Khả dụng', icon: <CheckCircle2 size={14} /> },
    BUSY: { label: 'Đang chạy', icon: <Activity size={14} /> },
    MAINTENANCE: { label: 'Bảo trì', icon: <Wrench size={14} /> },
    OFFLINE: { label: 'Ngoại tuyến', icon: <CircleOff size={14} /> },
  }
  const currentStatus = statusMeta[status ?? '']
  return (
    <section className={`machine-board-card ${tone}`}>
      <div className="machine-board-head">
        <div>
          <small>{name}</small>
          <b>{capacity}</b>
        </div>
        <span>{state}</span>
      </div>
      <div className="drum">
        <MachineIcon tone={tone} />
      </div>
      <footer>
        <div>
          <small>{action ? 'Đơn hàng:' : tone === 'empty' ? 'Khả dụng:' : 'Đang chạy:'}</small>
          <b>{detail}</b>
        </div>
        {onStatusChange ? (
          <div className="machine-actions">
            <label className="machine-status-select">
              <span>{currentStatus?.icon}</span>
              <select value={status} onChange={(event) => onStatusChange(event.target.value)} aria-label={`Trạng thái ${name}`}>
                <option value="AVAILABLE">Khả dụng</option>
                <option value="BUSY" disabled>Đang chạy</option>
                <option value="MAINTENANCE">Bảo trì</option>
                <option value="OFFLINE">Ngoại tuyến</option>
              </select>
            </label>
            {action && <button className="done" onClick={onAction}>{action}</button>}
          </div>
        ) : action ? (
          <button className="done" onClick={onAction}>
            {action}
          </button>
        ) : (
          <strong>{time}</strong>
        )}
      </footer>
    </section>
  )
}
