import type { ReactNode } from 'react'
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
