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
      <ViewHeader title="Tổng quan vận hành" subtitle="Số liệu lấy trực tiếp từ backend theo khoảng ngày" action="← Quay lại Hàng đợi" onAction={() => navigate('/queue')} />
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
          <ChartCard title="Doanh thu theo giờ"><div className="data-state">Chưa có trường doanh thu trong database.</div></ChartCard>
          <ChartCard title="Tình trạng giờ hẹn"><div className="donut-wrap"><div className="donut"><b>{data.kpis.orderCount ? Math.round(data.kpis.onTimeCount / data.kpis.orderCount * 100) : 0}%</b><small>ĐÚNG HẸN</small></div><div className="legend"><b><i className="green-dot" /> Đúng hẹn</b><small>{data.kpis.onTimeCount} đơn</small><b><i className="red-dot" /> Trễ hẹn</b><small>{data.kpis.lateCount} đơn</small></div></div></ChartCard>
          <ChartCard title="Giờ cao điểm hẹn lấy đồ"><div className="horizontal-bars">{data.pickupPeaks.length ? data.pickupPeaks.map((item) => <div key={item.label}><small>{item.label}</small><span><i style={{ width: `${item.value / maxPeak * 100}%` }} /></span><b>{item.value}</b></div>) : <div className="data-state">Không có dữ liệu.</div>}</div></ChartCard>
          <ChartCard title="Số lượng đơn theo ngày"><div className="bar-chart green-bars">{data.ordersByDay.length ? data.ordersByDay.map((item) => <div className="bar-column" key={item.label}><span style={{ height: `${item.value / maxDay * 100}%` }} /><small>{item.label}</small></div>) : <div className="data-state">Không có dữ liệu.</div>}</div></ChartCard>
        </div>
      </>}
    </section>
  )
}
