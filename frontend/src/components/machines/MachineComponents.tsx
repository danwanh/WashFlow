import { CheckCircle2, Wrench } from 'lucide-react'

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
  maintenance,
  switching,
  onToggleMaintenance,
}: {
  name: string
  capacity: string
  state: string
  tone: string
  detail: string
  time?: string
  action?: string
  onAction?: () => void
  maintenance?: boolean
  switching?: boolean
  onToggleMaintenance?: () => void
}) {
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
          <small>{action ? 'Order:' : tone === 'empty' ? 'Available:' : 'Running:'}</small>
          <b>{detail}</b>
        </div>
        {onToggleMaintenance ? (
          <div className="machine-actions">
            {/* On = in service (idle or running); off = under maintenance. */}
            <button
              type="button"
              role="switch"
              aria-checked={!maintenance}
              aria-label={`${name}: ${maintenance ? 'Maintenance' : 'Available'}`}
              className={`machine-service-switch ${maintenance ? 'maintenance' : ''}`}
              disabled={switching}
              onClick={onToggleMaintenance}
            >
              <span className="machine-service-track">
                <span className="machine-service-thumb" />
              </span>
              {maintenance ? <Wrench size={14} /> : <CheckCircle2 size={14} />}
              {maintenance ? 'Maintenance' : 'Available'}
            </button>
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
