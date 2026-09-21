import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { getOverview, type OverviewResponse } from '../api'
import { ChartCard, Kpi, ViewHeader } from '../components/overview/OverviewComponents'

const today = () => new Date().toISOString().slice(0, 10)
const formatMoney = (value: number) => value.toLocaleString('vi-VN') + 'đ'

export function OverviewPage() {
  const navigate = useNavigate()
  const [from, setFrom] = useState(today)
  const [to, setTo] = useState(today)
  const [data, setData] = useState<OverviewResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const load = () => {
    setLoading(true)
    void getOverview(from, to).then(setData).then(() => setError('')).catch((cause) => setError(cause instanceof Error ? cause.message : 'Không thể tải tổng quan')).finally(() => setLoading(false))
  }
  useEffect(() => { load() }, [from, to])
  const maxPeak = Math.max(1, ...(data?.pickupPeaks.map((item) => item.value) ?? []))
  const maxDay = Math.max(1, ...(data?.ordersByDay.map((item) => item.value) ?? []))
  return (
    <section className="view-panel">
      <ViewHeader title="Tổng quan vận hành" subtitle="" action="← Quay lại Hàng đợi" onAction={() => navigate('/queue')} />
      <div className="date-filter">
        <label>Từ ngày <input type="date" value={from} onChange={(event) => setFrom(event.target.value)} /></label>
        <label>Đến ngày <input type="date" value={to} onChange={(event) => setTo(event.target.value)} /></label>
      </div>
      {loading && <p className="data-state">Đang tải số liệu...</p>}
      {error && <p className="queue-error">{error} <button className="table-action" onClick={load}>Thử lại</button></p>}
      {data && !error && <>
        <div className="kpi-grid">
          <Kpi label="Doanh thu" value={data.kpis.revenue ? formatMoney(data.kpis.revenue) : 'Chưa có dữ liệu'} note="Database chưa có trường giá" tone="green" />
          <Kpi label="Đơn hàng" value={`${data.kpis.orderCount} đơn`} note={`Đang xử lý: ${data.kpis.processingCount} đơn`} tone="blue" />
          <Kpi label="Đúng hẹn" value={`${data.kpis.onTimeCount} đơn`} note={`${data.appointmentStatus.onTime} đơn đạt hạn`} tone="green" />
          <Kpi label="Trễ hẹn" value={`${data.kpis.lateCount} đơn`} note="Tính theo ETA và giờ hẹn" tone="red" />
        </div>
        <div className="chart-grid">
           <ChartCard title="Doanh thu theo giờ"><div className="bar-chart revenue-bars">{data.revenueByHour.length ? data.revenueByHour.map((item) => <div className="bar-column chart-interactive-bar revenue-bar" key={item.label} tabIndex={0}><span className="chart-tooltip">{item.label}: {formatMoney(item.value)}</span><span className="chart-value-bar" style={{ height: `${item.value / Math.max(1, ...data.revenueByHour.map((entry) => entry.value)) * 100}%` }} /><small>{item.label}</small></div>) : <div className="data-state">Chưa có doanh thu.</div>}</div></ChartCard>
           <ChartCard title="Tình trạng giờ hẹn"><AppointmentPie onTime={data.kpis.onTimeCount} late={data.kpis.lateCount} /></ChartCard>
           <ChartCard title="Giờ cao điểm hẹn lấy đồ"><div className="horizontal-bars">{data.pickupPeaks.length ? data.pickupPeaks.map((item) => <div className="chart-interactive-row peak-row" key={item.label} tabIndex={0}><small>{item.label}</small><span><i style={{ width: `${item.value / maxPeak * 100}%` }} /></span><span className="chart-tooltip">{item.label}: {item.value} đơn</span></div>) : <div className="data-state">Không có dữ liệu.</div>}</div></ChartCard>
           <ChartCard title="Số lượng đơn theo ngày"><div className="bar-chart green-bars">{data.ordersByDay.length ? data.ordersByDay.map((item) => <div className="bar-column chart-interactive-bar orders-bar" key={item.label} tabIndex={0}><span className="chart-tooltip">{item.label}: {item.value} đơn</span><span className="chart-value-bar" style={{ height: `${item.value / maxDay * 100}%` }} /><small>{item.label}</small></div>) : <div className="data-state">Không có dữ liệu.</div>}</div></ChartCard>
        </div>
      </>}
    </section>
  )
}

function AppointmentPie({ onTime, late }: { onTime: number; late: number }) {
  const total = onTime + late
  const onTimeRatio = total ? onTime / total : 0
  const angle = onTimeRatio * Math.PI * 2
  const point = (a: number, radius: number) => ({ x: 70 + Math.cos(a - Math.PI / 2) * radius, y: 70 + Math.sin(a - Math.PI / 2) * radius })
  const end = point(angle, 62)
  const largeArc = angle > Math.PI ? 1 : 0
  const onTimePath = total && onTime < total ? `M 70 70 L 70 8 A 62 62 0 ${largeArc} 1 ${end.x} ${end.y} Z` : 'M 70 70 m 0 -62 a 62 62 0 1 1 0 124 a 62 62 0 1 1 0 -124'
  const latePath = total && onTime > 0 && late > 0 ? `M 70 70 L ${end.x} ${end.y} A 62 62 0 ${largeArc} 1 70 8 Z` : ''
  return <div className="pie-wrap">
    <div className="pie-chart" role="img" aria-label={`Đúng hẹn ${onTime} đơn, trễ hẹn ${late} đơn`}>
      {onTime > 0 && <div className="pie-slice pie-on-time"><svg viewBox="0 0 140 140"><path d={onTimePath} /></svg><span className="chart-tooltip">Đúng hẹn: {onTime} đơn</span></div>}
      {late > 0 && <div className="pie-slice pie-late"><svg viewBox="0 0 140 140"><path d={latePath || 'M 70 70 m 0 -62 a 62 62 0 1 1 0 124 a 62 62 0 1 1 0 -124'} /></svg><span className="chart-tooltip">Trễ hẹn: {late} đơn</span></div>}
      <div className="pie-center"><b>{total ? Math.round(onTimeRatio * 100) : 0}%</b><small>ĐÚNG HẸN</small></div>
    </div>
    <div className="legend"><b><i className="green-dot" /> Đúng hẹn</b><small>{onTime} đơn</small><b><i className="red-dot" /> Trễ hẹn</b><small>{late} đơn</small></div>
  </div>
}
