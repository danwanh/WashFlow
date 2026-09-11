import { useNavigate } from 'react-router-dom'
import { ChartCard, Kpi, ViewHeader } from '../components/overview/OverviewComponents'

export function OverviewPage() {
  const navigate = useNavigate()
  const bars = [35, 55, 65, 95, 48]
  const hours = ['08:00', '10:00', '12:00', '14:00', '16:00']
  const peakTimes: [string, number, string][] = [
    ['08-10h', 30, '4đ'],
    ['10-12h', 45, '7đ'],
    ['12-14h', 35, '5đ'],
    ['14-16h', 75, '12đ'],
    ['16-18h', 90, '14đ'],
  ]
  return (
    <section className="view-panel">
      <ViewHeader
        title="Tổng quan vận hành"
        subtitle="Doanh thu, tỉ lệ trả đồ đúng hẹn và phụ tải máy móc theo thời gian thực"
        action="← Quay lại Hàng đợi"
        onAction={() => navigate('/queue')}
      />
      <div className="kpi-grid">
        <Kpi label="Doanh thu" value="2.450.000đ" note="↑ +12.5% so với hôm qua" tone="green" />
        <Kpi label="Đơn hàng" value="42 đơn" note="Đang xử lý: 4 đơn" tone="blue" />
        <Kpi label="Đúng hẹn" value="38 đơn" note="Đạt 90.5% chỉ tiêu" tone="green" />
        <Kpi label="Trễ hẹn" value="4 đơn" note="9.5% cần khắc phục" tone="red" />
      </div>
      <div className="chart-grid">
        <ChartCard title="1. Biểu đồ doanh thu theo giờ">
          <div className="bar-chart">
            {bars.map((height, index) => (
              <div className="bar-column" key={height}>
                <span style={{ height: `${height}%` }} className={index === 3 ? 'peak' : ''} />
                <small>{hours[index]}</small>
              </div>
            ))}
          </div>
        </ChartCard>
        <ChartCard title="2. Tình trạng giờ hẹn">
          <div className="donut-wrap">
            <div className="donut">
              <b>90.5%</b>
              <small>ĐÚNG HẸN</small>
            </div>
            <div className="legend">
              <b>
                <i className="green-dot" /> Đúng & Sớm hẹn
              </b>
              <small>38 đơn (90.5%)</small>
              <b>
                <i className="red-dot" /> Trễ hẹn
              </b>
              <small>4 đơn (9.5%)</small>
            </div>
          </div>
        </ChartCard>
        <ChartCard title="3. Giờ cao điểm hẹn lấy đồ">
          <div className="horizontal-bars">
            {peakTimes.map(([label, width, value]) => (
              <div key={label}>
                <small>{label}</small>
                <span>
                  <i style={{ width: `${width}%` }} />
                </span>
                <b>{value}</b>
              </div>
            ))}
          </div>
        </ChartCard>
        <ChartCard title="4. Số lượng đơn trong tuần">
          <div className="bar-chart green-bars">
            {[40, 60, 55, 75, 90].map((height, index) => (
              <div className="bar-column" key={height}>
                <span style={{ height: `${height}%` }} />
                <small>{['T2', 'T3', 'T4', 'T5', 'Hôm nay'][index]}</small>
              </div>
            ))}
          </div>
        </ChartCard>
      </div>
    </section>
  )
}
