import type { CSSProperties, ReactNode } from 'react'
export function ViewHeader({
  title,
  subtitle,
  action,
  onAction,
  primary,
}: {
  title: string
  subtitle: string
  action: string
  onAction: () => void
  primary?: boolean
}) {
  return (
    <div className="view-header">
      <div>
        <h1>{title}</h1>
        <p>{subtitle}</p>
      </div>
      <button className={primary ? 'primary' : 'secondary'} onClick={onAction}>
        {action}
      </button>
    </div>
  )
}
export function Kpi({
  label,
  value,
  note,
  tone,
}: {
  label: string
  value: string
  note: string
  tone: string
}) {
  return (
    <section className={`kpi ${tone}`}>
      <small>{label}</small>
      <b>{value}</b>
      <span>{note}</span>
    </section>
  )
}
export function ChartCard({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="chart-card">
      <b>{title}</b>
      {children}
    </section>
  )
}
// Shared hover/focus readout for every overview chart: value first, label second,
// keyed with a short stroke of the mark's color.
export function ChartTooltip({
  value,
  label,
  color,
  style,
}: {
  value: string
  label: string
  color: string
  style?: CSSProperties
}) {
  return (
    <div className="chart-tooltip" role="tooltip" style={style}>
      <b>{value}</b>
      <small>
        <em className="chart-tooltip-key" style={{ background: color }} />
        {label}
      </small>
    </div>
  )
}
