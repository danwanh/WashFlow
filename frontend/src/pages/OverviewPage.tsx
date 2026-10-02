import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { getOverview, type OverviewResponse } from '../api'
import { ChartCard, ChartTooltip, Kpi, ViewHeader } from '../components/overview/OverviewComponents'

const today = () => new Date().toISOString().slice(0, 10)
const formatMoney = (value: number) => value.toLocaleString('en-US') + ' VND'

// Mark colors, kept here so tooltip keys match the bars they describe.
const REVENUE_COLOR = '#7dd3fc'
const PEAK_COLOR = '#38bdf8'
const PEAK_LAST_COLOR = '#f59e0b'
const ORDERS_COLOR = '#6ee7b7'
const ORDERS_LAST_COLOR = '#059669'
const ON_TIME_COLOR = '#10b981'
const LATE_COLOR = '#f43f5e'

export function OverviewPage() {
  const navigate = useNavigate()
  const [from, setFrom] = useState(today)
  const [to, setTo] = useState(today)
  const [data, setData] = useState<OverviewResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const load = () => {
    setLoading(true)
    void getOverview(from, to).then(setData).then(() => setError('')).catch((cause) => setError(cause instanceof Error ? cause.message : 'Could not load the overview')).finally(() => setLoading(false))
  }
  useEffect(() => { load() }, [from, to])
  const maxPeak = Math.max(1, ...(data?.pickupPeaks.map((item) => item.value) ?? []))
  const maxDay = Math.max(1, ...(data?.ordersByDay.map((item) => item.value) ?? []))
  const maxRevenue = Math.max(1, ...(data?.revenueByHour.map((item) => item.value) ?? []))
  return (
    <section className="view-panel">
      <ViewHeader title="Operations overview" subtitle="" action="← Back to queue" onAction={() => navigate('/queue')} />
      <div className="date-filter">
        <label>From <input type="date" value={from} onChange={(event) => setFrom(event.target.value)} /></label>
        <label>To <input type="date" value={to} onChange={(event) => setTo(event.target.value)} /></label>
      </div>
      {loading && <p className="data-state">Loading data...</p>}
      {error && <p className="queue-error">{error} <button className="table-action" onClick={load}>Retry</button></p>}
      {data && !error && <>
        <div className="kpi-grid">
          <Kpi label="Revenue" value={data.kpis.revenue ? formatMoney(data.kpis.revenue) : 'No data yet'} note="The database has no price field yet" tone="green" />
          <Kpi label="Orders" value={`${data.kpis.orderCount} orders`} note={`In progress: ${data.kpis.processingCount} orders`} tone="blue" />
          <Kpi label="On time" value={`${data.kpis.onTimeCount} orders`} note={`${data.appointmentStatus.onTime} orders met the deadline`} tone="green" />
          <Kpi label="Late" value={`${data.kpis.lateCount} orders`} note="Based on ETA and pickup time" tone="red" />
        </div>
        <div className="chart-grid">
          <ChartCard title="Revenue by hour">
            <div className="bar-chart revenue-bars">
              {data.revenueByHour.length ? (
                data.revenueByHour.map((item) => (
                  <div className="bar-column chart-interactive-bar revenue-bar" key={item.label} tabIndex={0}>
                    <span className="chart-value-bar" style={{ height: `${(item.value / maxRevenue) * 100}%` }}>
                      <ChartTooltip value={formatMoney(item.value)} label={item.label} color={REVENUE_COLOR} />
                    </span>
                    <small>{item.label}</small>
                  </div>
                ))
              ) : (
                <div className="data-state">No revenue yet.</div>
              )}
            </div>
          </ChartCard>
          <ChartCard title="Pickup punctuality">
            <AppointmentPie onTime={data.kpis.onTimeCount} late={data.kpis.lateCount} />
          </ChartCard>
          <ChartCard title="Peak pickup hours">
            <div className="horizontal-bars">
              {data.pickupPeaks.length ? (
                data.pickupPeaks.map((item, index) => (
                  <div className="chart-interactive-row peak-row" key={item.label} tabIndex={0}>
                    <small>{item.label}</small>
                    <span>
                      <i style={{ width: `${(item.value / maxPeak) * 100}%` }}>
                        <ChartTooltip
                          value={`${item.value} orders`}
                          label={`Pickup at ${item.label}`}
                          color={index === data.pickupPeaks.length - 1 ? PEAK_LAST_COLOR : PEAK_COLOR}
                        />
                      </i>
                    </span>
                  </div>
                ))
              ) : (
                <div className="data-state">No data.</div>
              )}
            </div>
          </ChartCard>
          <ChartCard title="Orders per day">
            <div className="bar-chart green-bars">
              {data.ordersByDay.length ? (
                data.ordersByDay.map((item, index) => (
                  <div className="bar-column chart-interactive-bar orders-bar" key={item.label} tabIndex={0}>
                    <span className="chart-value-bar" style={{ height: `${(item.value / maxDay) * 100}%` }}>
                      <ChartTooltip
                        value={`${item.value} orders`}
                        label={item.label}
                        color={index === data.ordersByDay.length - 1 ? ORDERS_LAST_COLOR : ORDERS_COLOR}
                      />
                    </span>
                    <small>{item.label}</small>
                  </div>
                ))
              ) : (
                <div className="data-state">No data.</div>
              )}
            </div>
          </ChartCard>
        </div>
      </>}
    </section>
  )
}

const PIE_SIZE = 140
const PIE_RADIUS = 66
const PIE_CENTER = PIE_SIZE / 2

// Angle 0 points up and grows clockwise.
const piePoint = (angle: number, radius: number) => ({
  x: PIE_CENTER + Math.sin(angle) * radius,
  y: PIE_CENTER - Math.cos(angle) * radius,
})

function slicePath(start: number, end: number) {
  if (end - start >= Math.PI * 2 - 1e-6) {
    // A single 100% slice: an SVG arc cannot start and end at the same point.
    const top = PIE_CENTER - PIE_RADIUS
    return `M ${PIE_CENTER} ${top} A ${PIE_RADIUS} ${PIE_RADIUS} 0 1 1 ${PIE_CENTER} ${PIE_SIZE - top} A ${PIE_RADIUS} ${PIE_RADIUS} 0 1 1 ${PIE_CENTER} ${top} Z`
  }
  const from = piePoint(start, PIE_RADIUS)
  const to = piePoint(end, PIE_RADIUS)
  const largeArc = end - start > Math.PI ? 1 : 0
  return `M ${PIE_CENTER} ${PIE_CENTER} L ${from.x} ${from.y} A ${PIE_RADIUS} ${PIE_RADIUS} 0 ${largeArc} 1 ${to.x} ${to.y} Z`
}

function AppointmentPie({ onTime, late }: { onTime: number; late: number }) {
  const [active, setActive] = useState<string | null>(null)
  const total = onTime + late
  const onTimePercent = total ? Math.round((onTime / total) * 100) : 0
  if (!total) return <div className="data-state">No data.</div>
  let angle = 0
  const slices = [
    { key: 'on-time', label: 'On time', value: onTime, color: ON_TIME_COLOR },
    { key: 'late', label: 'Late', value: late, color: LATE_COLOR },
  ]
    .filter((slice) => slice.value > 0)
    .map((slice) => {
      const start = angle
      angle += (slice.value / total) * Math.PI * 2
      // Tooltip sits on the slice's mid-angle, inside the pie.
      const anchor = piePoint((start + angle) / 2, PIE_RADIUS * 0.55)
      return { ...slice, path: slicePath(start, angle), anchor }
    })
  const hovered = slices.find((slice) => slice.key === active)
  return (
    <div className="pie-wrap">
      <div className="pie-chart" role="img" aria-label={`On time ${onTime} orders, late ${late} orders`}>
        <svg viewBox={`0 0 ${PIE_SIZE} ${PIE_SIZE}`}>
          {slices.map((slice) => (
            <path
              key={slice.key}
              className={`pie-slice ${active === slice.key ? 'active' : ''}`}
              d={slice.path}
              fill={slice.color}
              tabIndex={0}
              aria-label={`${slice.label}: ${slice.value} orders`}
              onPointerEnter={() => setActive(slice.key)}
              onPointerLeave={() => setActive(null)}
              onFocus={() => setActive(slice.key)}
              onBlur={() => setActive(null)}
            />
          ))}
        </svg>
        {hovered && (
          <ChartTooltip
            value={`${hovered.value} orders · ${Math.round((hovered.value / total) * 100)}%`}
            label={hovered.label}
            color={hovered.color}
            style={{
              left: `${(hovered.anchor.x / PIE_SIZE) * 100}%`,
              top: `${(hovered.anchor.y / PIE_SIZE) * 100}%`,
              bottom: 'auto',
              opacity: 1,
              transform: 'translate(-50%, calc(-100% - 8px))',
            }}
          />
        )}
      </div>
      <div className="legend">
        <strong className="pie-headline">
          {onTimePercent}% <small>on time</small>
        </strong>
        <b><i className="green-dot" /> On time</b>
        <small>{onTime} orders</small>
        <b><i className="red-dot" /> Late</b>
        <small>{late} orders</small>
      </div>
    </div>
  )
}
