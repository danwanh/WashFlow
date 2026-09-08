import { useState } from 'react'
import {
  AlertTriangle,
  BarChart3,
  Check,
  CheckCircle2,
  ChevronRight,
  CircleHelp,
  Clock3,
  FileText,
  ListFilter,
  MessageCircle,
  Plus,
  Sparkles,
  WashingMachine,
  X,
} from 'lucide-react'

type Task = {
  id: string
  rank: number
  action: string
  customer: string
  group: string
  detail: string
  due: string
  tone: 'blue' | 'amber' | 'slate'
  badge?: string
  companion?: string
  button?: string
}

const initialTasks: Task[] = [
  {
    id: '123',
    rank: 1,
    action: 'LẤY ĐỒ RA · MÁY 02',
    customer: 'Nguyễn Văn A',
    group: 'Đồ trắng',
    detail: '3 món',
    due: '16:00',
    tone: 'blue',
    badge: 'Ưu tiên ngay',
  },
  {
    id: '128',
    rank: 2,
    action: 'VÀO MÁY GIẶT 01',
    customer: 'Trần Minh Anh',
    group: 'Áo quần',
    detail: 'Áo quần thể thao',
    due: '16:30',
    tone: 'blue',
    badge: '→ Kéo túi vào Máy 01',
    button: 'Đôn đơn',
  },
  {
    id: '123',
    rank: 3,
    action: 'VÀO MÁY GIẶT 01',
    customer: 'Nguyễn Văn A',
    group: 'Đồ màu',
    detail: 'Áo sơ mi màu & quần kaki',
    due: '16:00',
    tone: 'amber',
    badge: 'Cùng đơn Nguyễn Văn A',
    companion: 'Nhóm 2/2',
  },
  {
    id: '131',
    rank: 4,
    action: 'PHÂN LOẠI',
    customer: 'Lê Thị Mai',
    group: 'Chăn mền',
    detail: 'Chăn mền',
    due: '16:20',
    tone: 'slate',
    button: '✓  Xong',
  },
  {
    id: '135',
    rank: 5,
    action: 'XẾP ĐỒ',
    customer: 'Hoàng Nam',
    group: 'Áo khoác',
    detail: 'Áo khoác',
    due: '16:40',
    tone: 'slate',
    button: '✓  Xong',
  },
]

const toneClass = { blue: 'blue', amber: 'amber', slate: 'slate' }

function LaundryBagIcon() {
  return (
    <svg className="laundry-bag-icon" viewBox="0 0 32 32" fill="none" aria-hidden="true">
      <path
        d="M9 11C9 8 11 7 16 7C21 7 23 8 23 11L25 24C25 26.5 23 28 16 28C9 28 7 26.5 7 24L9 11Z"
        fill="currentColor"
        fillOpacity=".1"
        stroke="currentColor"
        strokeLinejoin="round"
        strokeWidth="1.75"
      />
      <path
        d="M12 7C12 5.5 13 4 16 4C19 4 20 5.5 20 7"
        stroke="currentColor"
        strokeLinecap="round"
        strokeWidth="1.75"
      />
      <ellipse cx="16" cy="7" rx="3.5" ry="1.5" fill="currentColor" />
      <path
        d="M13 16H19M14 20H18"
        stroke="currentColor"
        strokeLinecap="round"
        strokeWidth="1.5"
        opacity=".6"
      />
    </svg>
  )
}

function App() {
  const [tasks, setTasks] = useState(initialTasks)
  const [active, setActive] = useState('queue')
  const [selected, setSelected] = useState<Task | null>(null)
  const [modal, setModal] = useState<
    'create' | 'detail' | 'reschedule' | 'delay' | 'notify' | null
  >(null)
  const [toast, setToast] = useState(false)
  const [statusFilter, setStatusFilter] = useState('all')
  const [draggingTask, setDraggingTask] = useState<Task | null>(null)
  const [dropTarget, setDropTarget] = useState<string | null>(null)

  const showToast = () => {
    setToast(true)
    window.setTimeout(() => setToast(false), 3500)
  }

  const complete = (task: Task) => {
    setTasks((current) => current.filter((item) => item !== task))
    showToast()
  }

  const visibleTasks = tasks.filter((task) => {
    if (statusFilter === 'all') return true
    if (statusFilter === 'processing') return task.action.includes('MÁY')
    if (statusFilter === 'ready') return task.action.includes('LẤY ĐỒ')
    return task.action.includes('PHÂN LOẠI') || task.action.includes('XẾP ĐỒ')
  })

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand-area">
          <div className="brand-mark">
            <WashingMachine size={21} />
          </div>
          <div className="brand-copy">
            <strong>WashTrack</strong>
          </div>
          <nav className="main-nav">
            <NavButton
              active={active === 'queue'}
              onClick={() => setActive('queue')}
              icon={<ListFilter size={14} />}
              label="Hàng đợi"
              count="5"
            />
            <NavButton
              active={active === 'overview'}
              onClick={() => setActive('overview')}
              icon={<BarChart3 size={14} />}
              label="Tổng quan"
            />
            <NavButton
              active={active === 'orders'}
              onClick={() => setActive('orders')}
              icon={<FileText size={14} />}
              label="Đơn hàng"
            />
            <NavButton
              active={active === 'machines'}
              onClick={() => setActive('machines')}
              icon={<WashingMachine size={14} />}
              label="Máy"
            />
          </nav>
        </div>
        <div className="scenario-bar">
          <small>KỊCH BẢN:</small>
          <button onClick={() => setModal('create')}>
            + Tạo đơn
            <br />
            (Chia nhóm)
          </button>
          <button
            className="selected-scenario"
            onClick={() => {
              setSelected(initialTasks[0])
              setModal('detail')
            }}
          >
            ◉ Đơn #123
            <br />
            (2 nhóm)
          </button>
          <button className="amber-action" onClick={() => setModal('detail')}>
            ⚡ Demo 1<br />
            nhóm xong
          </button>
          <button className="green-action" onClick={() => setModal('notify')}>
            ✓ Đơn xong
            <br />
            hết → Gửi tin
          </button>
          <button className="red-action" onClick={() => setModal('delay')}>
            ⚠ Cảnh
            <br /> báo trễ
          </button>
        </div>
        <div className="live-meta">
          <span className="live-dot" />{' '}
          <span>
            IoT
            <br />
            Kết nối
          </span>
          <i />{' '}
          <strong>
            14:52 · Ca
            <br />
            chiều (Khu A)
          </strong>
        </div>
      </header>

      <main className="workspace">
        {active === 'queue' ? (
          <>
            <section className="queue-pane">
              <div className="queue-header">
                <div>
                  <div className="title-row">
                    <h1>HÀNG ĐỢI CÔNG VIỆC</h1>
                    <button className="primary small" onClick={() => setModal('create')}>
                      <Plus size={17} /> Tạo đơn
                    </button>
                  </div>
                  <p>
                    Xếp theo thứ tự ưu tiên tự động · TIME → RESULT → ACTION · Bấm để xem chi tiết
                  </p>
                </div>
                <div className="queue-tools">
                  <label className="status-filter">
                    Trạng thái
                    <select
                      value={statusFilter}
                      onChange={(event) => setStatusFilter(event.target.value)}
                    >
                      <option value="all">Tất cả trạng thái</option>
                      <option value="processing">Đang xử lý</option>
                      <option value="ready">Sẵn sàng lấy</option>
                      <option value="pending">Chờ xử lý</option>
                    </select>
                  </label>
                  <button
                    className="primary small queue-create-button"
                    onClick={() => setModal('create')}
                  >
                    <Plus size={17} /> Tạo đơn
                  </button>
                  <div className="alert-tools">
                    <b>THỬ CẢNH BÁO:</b>
                    <button className="green-chip" onClick={showToast}>
                      ✓ Máy xong
                    </button>
                    <button className="amber-chip" onClick={() => setModal('reschedule')}>
                      ⚠ Nhắc nhở
                      <br />
                      5p
                    </button>
                    <button className="red-chip" onClick={() => setModal('delay')}>
                      ⚠ Cảnh báo
                      <br />
                      trễ
                    </button>
                  </div>
                  <div className="count-chip">
                    <b>{tasks.length}</b> việc cần
                    <br />
                    xử lý
                  </div>
                </div>
              </div>
              <div className="task-list">
                {visibleTasks.map((task) => (
                  <TaskCard
                    key={`${task.id}-${task.rank}`}
                    task={task}
                    onClick={() => {
                      setSelected(task)
                      setModal('detail')
                    }}
                    onComplete={() => complete(task)}
                    onDragStart={() => setDraggingTask(task)}
                    onDragEnd={() => {
                      setDraggingTask(null)
                      setDropTarget(null)
                    }}
                    onReschedule={() => setModal('reschedule')}
                  />
                ))}
              </div>
              <article className="task-card order-summary-card">
                <div className="rank">
                  <b>•</b>
                </div>
                <div className="bag amber">
                  <MessageCircle size={23} />
                </div>
                <div className="task-info">
                  <div className="task-title">
                    <strong>CHỜ GỬI TIN KHÁCH</strong>
                  </div>
                  <div className="customer">
                    Nguyễn Văn A · <b>#123</b>
                  </div>
                  <div className="meta">
                    Đồ trắng đã giặt xong (Máy 02) · Đang chờ Đồ màu hoàn tất giặt sấy
                  </div>
                </div>
                <button className="notify-locked" disabled>
                  <MessageCircle size={13} /> Gửi tin khách
                </button>
              </article>
              <div className="upcoming">
                <div>
                  <b>SẮP TỚI</b>
                  <span>(Chưa vào hàng đợi ưu tiên · Bấm để xem chi tiết)</span>
                </div>
                <Upcoming time="17:55" id="#140 · Nguyễn An" />
                <Upcoming time="18:10" id="#145 · Trần Mai" />
              </div>
            </section>
            <MachinePane
              dropTarget={dropTarget}
              onDragOver={(machine) => {
                if (draggingTask) setDropTarget(machine)
              }}
              onDrop={(machine) => {
                if (!draggingTask) return
                setDropTarget(null)
                setDraggingTask(null)
                showToast()
              }}
            />
          </>
        ) : active === 'overview' ? (
          <OverviewView onBack={() => setActive('queue')} />
        ) : active === 'orders' ? (
          <OrdersView
            onCreate={() => setModal('create')}
            onOpen={(task) => {
              setSelected(task)
              setModal('detail')
            }}
          />
        ) : (
          <MachinesView
            onBack={() => setActive('queue')}
            onOpen={(task) => {
              setSelected(task)
              setModal('detail')
            }}
          />
        )}
      </main>

      {toast && (
        <div className="toast">
          <CheckCircle2 size={30} fill="currentColor" />
          <div>
            <b>✓ Máy 02 đã xong</b>
            <span>#123 · LẤY ĐỒ RA</span>
          </div>
          <button onClick={() => setToast(false)}>
            <X size={17} />
          </button>
        </div>
      )}
      {modal === 'detail' && selected && (
        <DetailModalCompact task={selected} onClose={() => setModal(null)} />
      )}
      {modal === 'create' && (
        <CreateOrderModalV1
          onClose={() => setModal(null)}
          onCreate={() => {
            setModal(null)
            showToast()
          }}
        />
      )}
      {modal === 'reschedule' && (
        <ScenarioModal
          type="reschedule"
          onClose={() => setModal(null)}
          onConfirm={() => {
            setModal(null)
            showToast()
          }}
        />
      )}
      {modal === 'delay' && (
        <ScenarioModal
          type="delay"
          onClose={() => setModal(null)}
          onConfirm={() => {
            setModal(null)
            showToast()
          }}
        />
      )}
      {modal === 'notify' && (
        <ScenarioModal
          type="notify"
          onClose={() => setModal(null)}
          onConfirm={() => {
            setModal(null)
            showToast()
          }}
        />
      )}
    </div>
  )
}

interface OverviewViewProps {
  onBack: () => void
}

function OverviewView({ onBack }: OverviewViewProps) {
  const bars = [35, 55, 65, 95, 48]
  return (
    <section className="view-panel">
      <ViewHeader
        title="Tổng quan vận hành"
        subtitle="Doanh thu, tỉ lệ trả đồ đúng hẹn và phụ tải máy móc theo thời gian thực"
        action="← Quay lại Hàng đợi"
        onAction={onBack}
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
                <small>{['08:00', '10:00', '12:00', '14:00', '16:00'][index]}</small>
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
            {[
              ['08-10h', 30, '4đ'],
              ['10-12h', 45, '7đ'],
              ['12-14h', 35, '5đ'],
              ['14-16h', 75, '12đ'],
              ['16-18h', 90, '14đ'],
            ].map(([label, width, value]) => (
              <div key={label as string}>
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

interface OrdersViewProps {
  onCreate: () => void
  onOpen: (task: Task) => void
}

function OrdersView({ onCreate, onOpen }: OrdersViewProps) {
  return (
    <section className="view-panel">
      <ViewHeader
        title="Danh sách đơn hàng hôm nay"
        subtitle="Toàn bộ đơn hàng ca trực · Bấm xem chi tiết để theo dõi luồng đồ"
        action="+ Tạo đơn mới"
        onAction={onCreate}
        primary
      />
      <div className="orders-table">
        <table>
          <thead>
            <tr>
              <th>Mã đơn</th>
              <th>Khách hàng</th>
              <th>Loại đồ / Phân nhóm</th>
              <th>Hạn trả</th>
              <th>Trạng thái</th>
              <th>Thao tác</th>
            </tr>
          </thead>
          <tbody>
            {initialTasks.slice(0, 4).map((task) => (
              <tr key={`${task.id}-${task.rank}`}>
                <td className="code">#{task.id}</td>
                <td className="strong">{task.customer}</td>
                <td>
                  <span className="table-pill">{task.group}</span>
                </td>
                <td className="code">{task.due}</td>
                <td>
                  <span className={`status ${task.tone}`}>{task.action}</span>
                </td>
                <td>
                  <button className="table-action" onClick={() => onOpen(task)}>
                    Xem chi tiết
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}

interface MachinesViewProps {
  onBack: () => void
  onOpen: (task: Task) => void
}

interface MachineIconProps {
  tone: string
}

function MachineIcon({ tone }: MachineIconProps) {
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

function MachinesView({ onBack, onOpen }: MachinesViewProps) {
  return (
    <section className="view-panel">
      <ViewHeader
        title="Giám sát thiết bị máy"
        subtitle="Cảm biến IoT lồng xoay, nhiệt độ sấy và thời gian chu trình theo máy"
        action="← Về Hàng đợi"
        onAction={onBack}
      />
      <div className="machine-board">
        <MachineBoardCard
          name="Máy giặt 01"
          capacity="Lồng ngang 10kg"
          state="Đang giặt"
          tone="blue"
          detail="#123 · Đồ màu"
          time="Còn 16 phút"
        />
        <MachineBoardCard
          name="Máy giặt 02"
          capacity="Lồng ngang 9kg"
          state="Đã xong · Chờ lấy"
          tone="green"
          detail="#123 · Đồ trắng"
          action="Lấy đồ ra"
          onAction={() => onOpen(initialTasks[0])}
        />
        <MachineBoardCard
          name="Máy giặt 03"
          capacity="Lồng ngang 12kg"
          state="Đang trống"
          tone="empty"
          detail="Sẵn sàng nhận đồ"
          time="0p"
        />
        <MachineBoardCard
          name="Máy sấy 01"
          capacity="Sấy hơi 10kg"
          state="Đang trống"
          tone="empty"
          detail="Sẵn sàng nhận đồ"
          time="0p"
        />
        <MachineBoardCard
          name="Máy sấy 02"
          capacity="Sấy nhiệt 12kg"
          state="Đang sấy"
          tone="amber"
          detail="#123 · Đồ trắng"
          time="Còn 8 phút"
        />
      </div>
    </section>
  )
}

interface ViewHeaderProps {
  title: string
  subtitle: string
  action: string
  onAction: () => void
  primary?: boolean
}
function ViewHeader({ title, subtitle, action, onAction, primary }: ViewHeaderProps) {
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
interface KpiProps {
  label: string
  value: string
  note: string
  tone: string
}
function Kpi({ label, value, note, tone }: KpiProps) {
  return (
    <section className={`kpi ${tone}`}>
      <small>{label}</small>
      <b>{value}</b>
      <span>{note}</span>
    </section>
  )
}
interface ChartCardProps {
  title: string
  children: React.ReactNode
}
function ChartCard({ title, children }: ChartCardProps) {
  return (
    <section className="chart-card">
      <b>{title}</b>
      {children}
    </section>
  )
}
interface MachineBoardCardProps {
  name: string
  capacity: string
  state: string
  tone: string
  detail: string
  time?: string
  action?: string
  onAction?: () => void
}
function MachineBoardCard({
  name,
  capacity,
  state,
  tone,
  detail,
  time,
  action,
  onAction,
}: MachineBoardCardProps) {
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
        {action ? (
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
interface ScenarioModalProps {
  type: 'reschedule' | 'delay' | 'notify'
  onClose: () => void
  onConfirm: () => void
}
function ScenarioModal({ type, onClose, onConfirm }: ScenarioModalProps) {
  const content = {
    reschedule: {
      title: 'Chỉnh giờ hẹn',
      heading: 'Đơn #128 · Trần Minh Anh',
      action: 'Xác nhận',
      message: 'Các đơn khác vẫn đúng giờ ✓. Hệ thống sẽ tự động đưa đơn lên đầu hàng đợi.',
    },
    delay: {
      title: '⚠ Đơn #123 có nguy cơ trễ',
      heading: 'Theo dõi tiến độ và cập nhật khách hàng',
      action: 'Đổi giờ hẹn sang 15:30',
      message: 'Dự kiến hoàn tất 15:20 (+20p). Giờ đề xuất tối ưu: 15:30.',
    },
    notify: {
      title: 'Gửi tin khách hàng',
      heading: 'Đơn #123 · Đã hoàn tất toàn bộ',
      action: 'Gửi tin khách',
      message: 'Khách hàng sẽ nhận được thông báo qua Zalo OA khi xác nhận.',
    },
  }[type]
  return (
    <ModalFrame title={content.title} onClose={onClose}>
      <div className={`scenario-body ${type}`}>
        <h3>{content.heading}</h3>
        <div className="scenario-result">
          <Clock3 size={18} />
          <span>{content.message}</span>
        </div>
        {type === 'reschedule' && (
          <div className="time-edit">
            <label>
              Giờ hiện tại
              <input defaultValue="15:30" />
            </label>
            <label>
              Giờ mới hẹn
              <input defaultValue="14:30" />
            </label>
          </div>
        )}
        {type === 'delay' && (
          <div className="suggested-time">
            <b>GIỜ ĐỀ XUẤT TỐI ƯU</b>
            <strong>15:30</strong>
          </div>
        )}
        {type === 'notify' && (
          <textarea defaultValue="Đơn hàng của bạn đã hoàn tất và sẵn sàng giao trả." />
        )}
      </div>
      <footer>
        <button className="secondary" onClick={onClose}>
          Hủy
        </button>
        <button className="primary" onClick={onConfirm}>
          {content.action}
        </button>
      </footer>
    </ModalFrame>
  )
}

function NavButton({
  active,
  onClick,
  icon,
  label,
  count,
}: {
  active: boolean
  onClick: () => void
  icon: React.ReactNode
  label: string
  count?: string
}) {
  return (
    <button className={`nav-button ${active ? 'active' : ''}`} onClick={onClick}>
      {icon}
      <span>{label}</span>
      {count && <b>{count}</b>}
    </button>
  )
}

function TaskCard({
  task,
  onClick,
  onComplete,
  onDragStart,
  onDragEnd,
  onReschedule,
}: {
  task: Task
  onClick: () => void
  onComplete: () => void
  onDragStart: () => void
  onDragEnd: () => void
  onReschedule: () => void
}) {
  const canDrag = task.action.includes('MÁY GIẶT')
  return (
    <article className={`task-card ${task.rank === 1 ? 'selected' : ''}`} onClick={onClick}>
      <div className="rank">
        {task.rank === 1 && <span>★</span>}
        <b>{task.rank}</b>
      </div>
      <div
        className={`bag ${toneClass[task.tone]} ${canDrag ? 'draggable-bag' : ''}`}
        draggable={canDrag}
        onDragStart={(event) => {
          if (!canDrag) return
          event.stopPropagation()
          event.dataTransfer.effectAllowed = 'move'
          event.dataTransfer.setData('text/plain', task.id)
          onDragStart()
        }}
        onDragEnd={(event) => {
          event.stopPropagation()
          onDragEnd()
        }}
        title={canDrag ? 'Kéo túi vào máy' : undefined}
      >
        <LaundryBagIcon />
      </div>
      <div className="task-info">
        <div className="task-title">
          <strong>{task.action}</strong>
        </div>
        <div className="customer">
          {task.customer} · <b>#{task.id}</b>
        </div>
        <div className="meta">
          {task.detail} <i>·</i> <strong>Hẹn {task.due}</strong>
          {task.button !== 'Đôn đơn' && <a>Chỉnh giờ hẹn</a>}
        </div>
      </div>
      <div className="task-action">
        {task.button &&
          (task.button === '✓  Xong' ? (
            <button
              className="done"
              onClick={(event) => {
                event.stopPropagation()
                onComplete()
              }}
            >
              <Check size={15} /> Xong
            </button>
          ) : (
            <button
              className="secondary"
              onClick={(event) => {
                event.stopPropagation()
                onReschedule()
              }}
            >
              {task.button === 'Đôn đơn' ? 'Đôn đơn · Chỉnh giờ hẹn' : task.button}
            </button>
          ))}
      </div>
    </article>
  )
}

function MachinePane({
  dropTarget,
  onDragOver,
  onDrop,
}: {
  dropTarget: string | null
  onDragOver: (machine: string) => void
  onDrop: (machine: string) => void
}) {
  return (
    <aside className="machines-pane">
      <MachineGroup title="MÁY GIẶT" count="3 MÁY">
        <Machine
          title="Máy 01"
          state="16 phút"
          tone="blue"
          tag="#123 · Đồ màu"
          dropTarget={dropTarget === 'Máy 01'}
          onDragOver={() => onDragOver('Máy 01')}
          onDrop={() => onDrop('Máy 01')}
        />
        <Machine
          title="Máy 02"
          state="Xong"
          tone="green"
          tag="#123 · Đồ trắng"
          dropTarget={dropTarget === 'Máy 02'}
          onDragOver={() => onDragOver('Máy 02')}
          onDrop={() => onDrop('Máy 02')}
        />
        <Machine
          title="Máy 03"
          state="Trống"
          tone="empty"
          dropTarget={dropTarget === 'Máy 03'}
          onDragOver={() => onDragOver('Máy 03')}
          onDrop={() => onDrop('Máy 03')}
        />
      </MachineGroup>
      <MachineGroup title="MÁY SẤY" count="2 MÁY">
        <Machine
          title="Sấy 01"
          state="Trống"
          tone="empty"
          dropTarget={dropTarget === 'Sấy 01'}
          onDragOver={() => onDragOver('Sấy 01')}
          onDrop={() => onDrop('Sấy 01')}
        />
        <Machine
          title="Sấy 02"
          state="8 phút"
          tone="amber"
          tag="#123 · Đồ trắng"
          dropTarget={dropTarget === 'Sấy 02'}
          onDragOver={() => onDragOver('Sấy 02')}
          onDrop={() => onDrop('Sấy 02')}
        />
      </MachineGroup>
    </aside>
  )
}
function MachineGroup({
  title,
  count,
  children,
}: {
  title: string
  count: string
  children: React.ReactNode
}) {
  return (
    <section className="machine-group">
      <div className="machine-heading">
        <b>{title}</b>
        <span>{count}</span>
      </div>
      <div className="machine-grid">{children}</div>
    </section>
  )
}
function Machine({
  title,
  state,
  tone,
  tag,
  dropTarget,
  onDragOver,
  onDrop,
}: {
  title: string
  state: string
  tone: string
  tag?: string
  dropTarget: boolean
  onDragOver: () => void
  onDrop: () => void
}) {
  return (
    <div
      className={`machine ${tone} ${dropTarget ? 'machine-drop-target' : ''}`}
      onDragOver={(event) => {
        event.preventDefault()
        event.dataTransfer.dropEffect = 'move'
        onDragOver()
      }}
      onDragEnter={(event) => {
        event.preventDefault()
        onDragOver()
      }}
      onDrop={(event) => {
        event.preventDefault()
        onDrop()
      }}
    >
      <MachineIcon tone={tone} />
      <strong>{title}</strong>
      <b>{state}</b>
      {tag && <small>{tag}</small>}
    </div>
  )
}
function Upcoming({ time, id }: { time: string; id: string }) {
  return (
    <div className="upcoming-row">
      <b>{time}</b>
      <strong>PHÂN LOẠI</strong>
      <span>{id}</span>
      <em>Chờ đồ đến</em>
    </div>
  )
}

function ModalFrame({
  children,
  title,
  onClose,
  className = '',
  icon,
}: {
  children: React.ReactNode
  title: string
  onClose: () => void
  className?: string
  icon?: React.ReactNode
}) {
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className={`modal ${className}`} onClick={(event) => event.stopPropagation()}>
        <header>
          <div>
            <span className="modal-icon">{icon ?? <FileText size={18} />}</span>
            <div>
              <b>{title}</b>
            </div>
          </div>
          <button onClick={onClose}>
            <X size={19} />
          </button>
        </header>
        {children}
      </div>
    </div>
  )
}
function DetailModal({ task, onClose }: { task: Task; onClose: () => void }) {
  return (
    <ModalFrame title={`Đơn #${task.id} · ${task.customer}`} onClose={onClose}>
      <div className="modal-body">
        <div className="detail-banner">
          <div>
            <small>TRẠNG THÁI TỔNG ĐƠN</small>
            <b>● Đang xử lý 2 nhóm (Dự kiến xong 15:45 ✓ Đúng hẹn)</b>
          </div>
          <strong>
            Hạn giao khách
            <br />
            <code>16:00 Hôm nay</code>
          </strong>
        </div>
        <h3>TIẾN TRÌNH THEO NHÓM XỬ LÝ (2 NHÓM)</h3>
        <Progress title="NHÓM 1: ĐỒ TRẮNG" status="Đang sấy · Sấy 02 (còn 8p)" tone="amber" />
        <Progress title="NHÓM 2: ĐỒ MÀU" status="Đang giặt · Máy 01 (còn 16p)" tone="blue" />
        <div className="notice">
          <CircleHelp size={16} /> Chờ hoàn tất Đồ màu để đủ bộ giao khách. Nút gửi tin khách sẽ mở
          khóa khi mọi nhóm hoàn tất.
        </div>
        <div className="detail-columns">
          <div>
            <small>PHÂN BỔ MÓN THEO NHÓM</small>
            <p>
              <b>[Đồ trắng]</b> 3 Áo sơ mi trắng, 1 Khăn
            </p>
            <p>
              <b>[Đồ màu]</b> 2 Quần tây xanh, 1 Áo thun đen
            </p>
          </div>
          <div>
            <small>GÓI DỊCH VỤ</small>
            <b>Giặt riêng chia màu + Sấy tiêu chuẩn</b>
            <hr />
            <small>GHI CHÚ GIẶT</small>
            <i>“Ủi phẳng cổ áo sơ mi trắng, không dùng nước xả mùi nồng cho đồ màu”</i>
          </div>
        </div>
      </div>
      <footer>
        <button className="secondary" onClick={onClose}>
          Đóng
        </button>
        <button className="primary">
          Xử lý tác vụ nhóm <ChevronRight size={14} />
        </button>
      </footer>
    </ModalFrame>
  )
}

interface DetailModalCompactProps {
  task: Task
  onClose: () => void
}

function DetailModalCompact({ task, onClose }: DetailModalCompactProps) {
  return (
    <ModalFrame
      title={`Đơn #${task.id} · ${task.customer}`}
      onClose={onClose}
      className="compact-detail-modal"
    >
      <div className="compact-detail-body">
        <div className="compact-summary">
          <div>
            <small>ĐANG XỬ LÝ</small>
            <b>2 nhóm xử lý độc lập</b>
            <span>Gói giặt riêng chia màu + sấy tiêu chuẩn</span>
          </div>
          <div className="compact-deadline">
            <small>HẠN GIAO</small>
            <strong>16:00</strong>
            <span>Hôm nay · Đúng hẹn</span>
          </div>
        </div>
        <div className="compact-groups">
          <ProgressVisual
            title="Đồ trắng · 3 món · 1.5kg"
            status="Đang sấy · Sấy 02 · còn 8p"
            tone="amber"
            current={2}
          />
          <ProgressVisual
            title="Đồ màu · 2 món · 2.0kg"
            status="Đang giặt · Máy 01 · còn 16p"
            tone="blue"
            current={1}
          />
        </div>
        <div className="compact-next">
          <CircleHelp size={16} />
          <span>
            <b>Tiếp theo</b> · Chờ Đồ màu hoàn tất để giao đủ đơn. Gửi tin khách sẽ mở khóa sau khi
            cả 2 nhóm xong.
          </span>
        </div>
      </div>
      <footer>
        <button className="secondary" onClick={onClose}>
          Đóng
        </button>
        <button className="primary">
          Xử lý tác vụ nhóm <ChevronRight size={14} />
        </button>
      </footer>
    </ModalFrame>
  )
}

interface ProgressVisualProps {
  title: string
  status: string
  tone: 'blue' | 'amber'
  current: number
}
function ProgressVisual({ title, status, tone, current }: ProgressVisualProps) {
  const steps = ['Tiếp nhận', 'Phân loại', 'Giặt', 'Sấy', 'Xếp đồ']
  return (
    <section className={`progress-visual ${tone}`}>
      <div className="progress-visual-heading">
        <b>{title}</b>
        <span>{status}</span>
      </div>
      <div className={`visual-stepper current-${current}`}>
        {steps.map((step, index) => (
          <div
            className={`visual-step ${index < current ? 'done' : index === current ? 'active' : ''}`}
            key={step}
          >
            <i>{index < current ? '✓' : index + 1}</i>
            <small>{step}</small>
          </div>
        ))}
      </div>
    </section>
  )
}
function Progress({ title, status, tone }: { title: string; status: string; tone: string }) {
  return (
    <div className="progress">
      <div>
        <b>{title}</b>
        <span className={`pill pill-${tone}`}>{status}</span>
      </div>
      <div className="steps">
        <span className="complete">✓ Phân loại</span>
        <span className="complete">✓ Giặt</span>
        <span className={tone === 'amber' ? 'current amber-text' : 'current'}>
          ● {tone === 'amber' ? 'Sấy (Sấy 02 - 8p)' : 'Giặt (Máy 01 - 16p)'}
        </span>
        <span>○ Xếp đồ</span>
      </div>
    </div>
  )
}
function CreateModal({ onClose, onCreate }: { onClose: () => void; onCreate: () => void }) {
  return (
    <ModalFrame
      title="Tạo đơn hàng mới (Hỗ trợ chia nhóm)"
      onClose={onClose}
      className="create-modal"
      icon={<Plus size={18} />}
    >
      <div className="modal-body form-body">
        <label>
          Tên khách hàng
          <input defaultValue="Nguyễn Văn A" />
        </label>
        <div className="form-grid">
          <label>
            Số điện thoại
            <input defaultValue="0901 234 567" />
          </label>
          <label>
            Hạn giao
            <input defaultValue="16:00" />
          </label>
        </div>
        <label>
          Gói dịch vụ
          <select defaultValue="split">
            <option value="split">Giặt riêng chia màu + Sấy tiêu chuẩn</option>
            <option>Giặt sấy tiêu chuẩn</option>
          </select>
        </label>
        <div className="group-section">
          <label>Phân chia nhóm xử lý độc lập</label>
          <div className="group-list">
            <div className="group-row">
              <div>
                <span className="group-dot blue-dot" />
                <b>Nhóm 1 (Đồ trắng)</b>
                <small> · 1.5kg (Gợi ý Máy 02)</small>
              </div>
              <strong>37.500đ</strong>
            </div>
            <div className="group-row">
              <div>
                <span className="group-dot amber-dot" />
                <b>Nhóm 2 (Đồ màu)</b>
                <small> · 2.0kg (Gợi ý Máy 01)</small>
              </div>
              <strong>55.000đ</strong>
            </div>
          </div>
        </div>
        <div className="price">
          <span>
            TỔNG TIỀN TẠM TÍNH<small>2 nhóm xử lý</small>
          </span>
          <b>92.500đ</b>
        </div>
        <div className="success-box">
          <CheckCircle2 size={21} />
          <span>
            <b>✓ 16:00 khả thi | Tổng 92.500đ</b>
            <small>Nhóm lâu nhất hoàn tất lúc 15:45 · Kịp giờ hẹn khách</small>
          </span>
        </div>
      </div>
      <footer>
        <button className="secondary" onClick={onClose}>
          Hủy
        </button>
        <button className="primary" onClick={onCreate}>
          Tạo đơn
        </button>
      </footer>
    </ModalFrame>
  )
}

interface CreateOrderModalV1Props {
  onClose: () => void
  onCreate: () => void
}

function CreateOrderModalV1({ onClose, onCreate }: CreateOrderModalV1Props) {
  return (
    <ModalFrame
      title="Tạo đơn hàng mới & Tính giá"
      onClose={onClose}
      className="create-modal-v1"
      icon={<Plus size={18} />}
    >
      <div className="modal-body create-order-body">
        <div className="create-fields">
          <label>
            Khách hàng
            <input defaultValue="Nguyễn Văn A" placeholder="Tên khách hàng..." />
          </label>
          <label>
            Giờ khách hẹn lấy
            <div className="time-check">
              <input defaultValue="16:00" />
              <button type="button">Kiểm tra</button>
            </div>
          </label>
        </div>
        <div className="field-block">
          <div className="field-heading">
            <label>Chọn nhanh loại đồ</label>
          </div>
          <div className="item-chips">
            <button type="button">
              <b>+ Đồ trắng</b>
              <small>1.5kg</small>
            </button>
            <button type="button">
              <b>+ Đồ màu</b>
              <small>2.0kg</small>
            </button>
            <button type="button">
              <b>+ Chăn mền</b>
              <small>1 cái</small>
            </button>
          </div>
        </div>
        <div className="field-block">
          <div className="field-heading">
            <label>Danh sách đồ đã chọn (3 món)</label>
            <button className="split-toggle" type="button">
              ⚡ Chia nhóm xử lý <b>2 nhóm</b>
            </button>
          </div>
          <div className="partition-box">
            <PartitionRow
              tone="blue"
              title="Nhóm 1 (Đồ trắng)"
              hint="Gợi ý: Máy 02 / Sấy 02"
              item="Áo sơ mi trắng"
              weight="1.5 kg"
              price="37.500đ"
            />
            <PartitionRow
              tone="amber"
              title="Nhóm 2 (Đồ màu)"
              hint="Gợi ý: Máy 01"
              item="Quần tây & áo thun màu"
              weight="2.0 kg"
              price="55.000đ"
            />
            <div className="partition-footer">
              <button type="button">+ Thêm nhóm xử lý mới</button>
            </div>
          </div>
        </div>
        <div className="service-total">
          <label>
            Dịch vụ
            <select defaultValue="Giặt chia màu + Sấy">
              <option>Giặt chia màu + Sấy</option>
              <option>Giặt sấy tiêu chuẩn</option>
              <option>Chỉ Giặt</option>
              <option>Giặt hấp cao cấp</option>
            </select>
          </label>
          <div className="total-box">
            <span>
              TỔNG TIỀN TẠM TÍNH<small>2 nhóm xử lý</small>
            </span>
            <b>92.500đ</b>
          </div>
        </div>
        <div className="feasibility">
          <CheckCircle2 size={20} />
          <div>
            <b>✓ 16:00 khả thi | Tổng 92.500đ</b>
            <small>Nhóm lâu nhất hoàn tất lúc 15:45 · Kịp giờ hẹn khách</small>
          </div>
        </div>
      </div>
      <footer>
        <button className="secondary" onClick={onClose}>
          Hủy
        </button>
        <button className="primary" onClick={onCreate}>
          Tạo đơn
        </button>
      </footer>
    </ModalFrame>
  )
}

interface PartitionRowProps {
  tone: 'blue' | 'amber'
  title: string
  hint: string
  item: string
  weight: string
  price: string
}
function PartitionRow({ tone, title, hint, item, weight, price }: PartitionRowProps) {
  return (
    <div className="partition-row">
      <div className="partition-heading">
        <div>
          <span className={`group-dot ${tone}-dot`} />
          <b>{title}</b>
          <small>{hint}</small>
        </div>
        <button type="button">Đổi tên</button>
      </div>
      <div className="partition-item">
        <span>
          • {item} <small>({weight})</small>
        </span>
        <strong>{price}</strong>
      </div>
    </div>
  )
}

export default App
