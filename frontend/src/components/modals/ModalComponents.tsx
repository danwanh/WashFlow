import {
  AlertTriangle,
  Check,
  CheckCircle2,
  ChevronRight,
  CircleHelp,
  Clock3,
  FileText,
  Plus,
  X,
} from 'lucide-react'
import { useState } from 'react'
import {
  createOrder,
  previewOrder,
  type CreatedOrder,
  type PlanResponse,
  type ServiceType,
} from '../../api'
import type { Task } from '../../types/task'

export function ModalFrame({
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

export function DetailModal({ task, onClose }: { task: Task; onClose: () => void }) {
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
          <Progress
            title="Đồ trắng · 3 món · 1.5kg"
            status="Đang sấy · Sấy 02 · còn 8p"
            tone="amber"
            current={2}
          />
          <Progress
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
function Progress({
  title,
  status,
  tone,
  current,
}: {
  title: string
  status: string
  tone: 'blue' | 'amber'
  current: number
}) {
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

export function ScenarioModal({
  type,
  onClose,
  onConfirm,
}: {
  type: 'reschedule' | 'delay' | 'notify'
  onClose: () => void
  onConfirm: () => void
}) {
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

type Item = { id: number; itemType: string; quantity: string; weight: string; note: string }
const quickItemTypes = [
  'Đồ trắng',
  'Đồ màu',
  'Khăn / đồ nặng',
  'Đồ thể thao',
  'Đồ mỏng / dễ hỏng',
  'Đồ đặc biệt',
]
const groupNames: Record<string, string> = {
  WHITE_NORMAL: 'Đồ trắng thông thường',
  LIGHT_NORMAL: 'Đồ sáng màu',
  DARK_NORMAL: 'Đồ màu sẫm',
  BLACK_NORMAL: 'Đồ đen',
  TOWEL_HEAVY: 'Khăn và đồ nặng',
  JEANS_HEAVY: 'Quần jeans và đồ dày',
  SPORT: 'Đồ thể thao',
  DELICATE: 'Đồ mỏng, dễ hỏng',
  SPECIAL: 'Đồ cần xử lý riêng',
}

export function CreateOrderModal({
  onClose,
  onCreate,
}: {
  onClose: () => void
  onCreate: (order: CreatedOrder) => void
}) {
  const [step, setStep] = useState<'details' | 'plan'>('details')
  const [customer, setCustomer] = useState('')
  const [phone, setPhone] = useState('')
  const [service, setService] = useState<ServiceType>('WASH_DRY')
  const [pickupAt, setPickupAt] = useState('16:00')
  const [note, setNote] = useState('')
  const [items, setItems] = useState<Item[]>([
    { id: 1, itemType: 'Đồ trắng', quantity: '1', weight: '1.5', note: '' },
  ])
  const [plan, setPlan] = useState<PlanResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const totalWeight = items.reduce((sum, item) => sum + Number(item.weight || 0), 0)
  const totalItems = items.reduce((sum, item) => sum + Number(item.quantity || 0), 0)
  const estimated = plan?.estimated_at
    ? new Date(plan.estimated_at).toLocaleTimeString('vi-VN', {
        hour: '2-digit',
        minute: '2-digit',
      })
    : '--:--'
  const noFeasibleMachine = plan?.warnings.includes('NO_FEASIBLE_MACHINE')
  const pickupTimestamp = () => {
    const [hours, minutes] = pickupAt.split(':').map(Number)
    const date = new Date()
    date.setHours(hours ?? 0, minutes ?? 0, 0, 0)
    return date.toISOString()
  }
  const itemCode = (value: string) =>
    ({
      'Đồ trắng': 'white',
      'Đồ màu': 'color',
      'Khăn / đồ nặng': 'towel',
      'Đồ thể thao': 'sport',
      'Đồ mỏng / dễ hỏng': 'delicate',
      'Đồ đặc biệt': 'special',
    })[value] ?? value
  const preview = async () => {
    setLoading(true)
    setError('')
    try {
      setPlan(
        await previewOrder({
          customer: { name: customer.trim(), phone: phone.trim() },
          service_type: service,
          pickup_at: pickupTimestamp(),
          priority: 0,
          special_note: note.trim() || undefined,
          items: items.map((item) => ({
            item_type: itemCode(item.itemType),
            quantity: Number(item.quantity),
            weight_kg: Number(item.weight),
            note: item.note.trim() || undefined,
          })),
        }),
      )
      setStep('plan')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Không thể lập kế hoạch thử')
    } finally {
      setLoading(false)
    }
  }
  const confirm = async () => {
    if (!plan) return
    setLoading(true)
    setError('')
    try {
      onCreate(await createOrder(plan.plan_id))
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Không thể tạo đơn hàng')
    } finally {
      setLoading(false)
    }
  }
  const addItem = (itemType = '') =>
    setItems((current) => [
      ...current,
      { id: Date.now(), itemType, quantity: '1', weight: '', note: '' },
    ])
  const update = (id: number, field: keyof Item, value: string) =>
    setItems((current) =>
      current.map((item) => (item.id === id ? { ...item, [field]: value } : item)),
    )
  const description = (index: number) => {
    const item = items[index]
    return item
      ? `${item.itemType || 'Loại đồ chưa xác định'} · ${item.quantity} món · ${Number(item.weight || 0).toFixed(1)} kg`
      : 'Loại đồ chưa xác định'
  }
  return (
    <ModalFrame
      title={step === 'details' ? 'Tạo đơn hàng mới' : 'Xác nhận đơn hàng'}
      onClose={onClose}
      className="create-modal-v1 create-order-spec-modal"
      icon={<Plus size={18} />}
    >
      <div className="modal-body create-order-body">
        <div className="spec-stepper">
          <span className={step === 'details' ? 'active' : 'done'}>
            <b>{step === 'details' ? '1' : '✓'}</b> Thông tin đơn
          </span>
          <i className={step === 'plan' ? 'done' : ''} />
          <span className={step === 'plan' ? 'active' : ''}>
            <b>2</b> Lịch xử lý
          </span>
        </div>
        {step === 'details' ? (
          <>
            <div className="create-fields">
              <label>
                Tên khách hàng *
                <input
                  value={customer}
                  onChange={(e) => setCustomer(e.target.value)}
                  placeholder="Nhập tên khách hàng"
                />
              </label>
              <label>
                Số điện thoại
                <input
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="0901 234 567"
                />
              </label>
            </div>
            <div className="create-fields">
              <label>
                Dịch vụ *
                <select value={service} onChange={(e) => setService(e.target.value as ServiceType)}>
                  <option value="WASH">Giặt</option>
                  <option value="DRY">Sấy</option>
                  <option value="WASH_DRY">Giặt + Sấy</option>
                </select>
              </label>
              <label>
                Giờ hẹn nhận đồ *
                <input
                  className="time-input"
                  type="time"
                  value={pickupAt}
                  onChange={(e) => setPickupAt(e.target.value)}
                />
              </label>
            </div>
            <div className="field-block">
              <div className="field-heading">
                <label>Danh sách đồ *</label>
                <span>
                  {totalItems} món · {totalWeight.toFixed(1)} kg
                </span>
              </div>
              <div className="item-chips spec-quick-items">
                {quickItemTypes.map((type) => (
                  <button key={type} type="button" onClick={() => addItem(type)}>
                    <b>+ {type}</b>
                  </button>
                ))}
              </div>
              <div className="order-items-list">
                {items.map((item, index) => (
                  <div className="order-item-row" key={item.id}>
                    <strong>{index + 1}</strong>
                    <input
                      aria-label="Loại đồ"
                      value={item.itemType}
                      onChange={(e) => update(item.id, 'itemType', e.target.value)}
                      placeholder="Loại đồ"
                    />
                    <input
                      aria-label="Số lượng"
                      type="number"
                      min="1"
                      value={item.quantity}
                      onChange={(e) => update(item.id, 'quantity', e.target.value)}
                      placeholder="SL"
                    />
                    <input
                      aria-label="Khối lượng"
                      type="number"
                      min="0"
                      step="0.1"
                      value={item.weight}
                      onChange={(e) => update(item.id, 'weight', e.target.value)}
                      placeholder="Kg"
                    />
                    <input
                      aria-label="Ghi chú món đồ"
                      value={item.note}
                      onChange={(e) => update(item.id, 'note', e.target.value)}
                      placeholder="Ghi chú"
                    />
                    <button
                      className="remove-item"
                      type="button"
                      onClick={() =>
                        setItems((current) => current.filter((entry) => entry.id !== item.id))
                      }
                      aria-label="Xóa món đồ"
                    >
                      <X size={15} />
                    </button>
                  </div>
                ))}
              </div>
              <button className="add-item-button" type="button" onClick={() => addItem()}>
                + Thêm loại đồ
              </button>
            </div>
            <label className="special-note">
              Ghi chú đặc biệt
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Ví dụ: không dùng nước xả, cần xử lý riêng..."
              />
            </label>
            {error && <div className="form-error">{error}</div>}
          </>
        ) : (
          <>
            <div className="plan-summary">
              <div>
                <small>KHÁCH HÀNG</small>
                <b>{customer || 'Chưa nhập tên'}</b>
                <span>{phone || 'Chưa có số điện thoại'}</span>
              </div>
              <div>
                <small>DỊCH VỤ</small>
                <b>{service === 'WASH' ? 'Giặt' : service === 'DRY' ? 'Sấy' : 'Giặt + Sấy'}</b>
                <span>Hẹn nhận lúc {pickupAt}</span>
              </div>
            </div>
            <div className="plan-section">
              <div className="plan-section-heading">
                <b>1. Nhóm tương thích</b>
                <em>{plan?.compatibility_groups.length ?? 0} nhóm</em>
              </div>
              {plan?.compatibility_groups.map((group, index) => (
                <div className="plan-group" key={group.group}>
                  <span className={`group-dot ${index % 2 ? 'amber-dot' : 'blue-dot'}`} />
                  <div>
                    <b>
                      Nhóm {index + 1} · {groupNames[group.group] ?? group.group}
                    </b>
                    <small>{group.itemIndices.map(description).join(' | ')}</small>
                  </div>
                  <strong>
                    {plan.batches.filter((batch) => batch.group === group.group).length} mẻ
                  </strong>
                </div>
              ))}
            </div>
            <div className="plan-section">
              <div className="plan-section-heading">
                <b>2. Lịch xử lý theo từng mẻ</b>
              </div>
              {plan?.batches.map((batch) => (
                <div className="batch-schedule" key={batch.batchNo}>
                  <div className="batch-schedule-heading">
                    <div>
                      <b>
                        Mẻ {batch.batchNo} · {groupNames[batch.group] ?? batch.group}
                      </b>
                      <small>
                        {batch.items.map((item) => description(item.itemIndex)).join(' | ')}
                      </small>
                    </div>
                    <strong>{batch.weightKg.toFixed(1)} kg</strong>
                  </div>
                  <div className="schedule-stages">
                    {batch.stages.map((stage) => (
                      <div className="schedule-stage" key={`${batch.batchNo}-${stage.stage}`}>
                        <i>{stage.stage === 'WASH' ? 'Giặt' : 'Sấy'}</i>
                        <b>
                          {stage.stage === 'WASH' ? 'Máy giặt' : 'Máy sấy'} #{stage.machineId}
                        </b>
                        <span>
                          {new Date(stage.plannedStartAt).toLocaleTimeString('vi-VN', {
                            hour: '2-digit',
                            minute: '2-digit',
                          })}{' '}
                          -{' '}
                          {new Date(stage.plannedEndAt).toLocaleTimeString('vi-VN', {
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
            <div className={`plan-feasibility ${plan?.feasible ? 'feasible' : 'not-feasible'}`}>
              {plan?.feasible && !noFeasibleMachine ? (
                <CheckCircle2 size={21} />
              ) : (
                <AlertTriangle size={21} />
              )}
              <div>
                <b>
                  {noFeasibleMachine
                    ? 'Không thể lập lịch · Không có máy phù hợp'
                    : plan?.feasible
                      ? `Khả thi · ETA ${estimated} · Đúng giờ hẹn`
                      : `Không khả thi · ETA ${estimated} sau giờ hẹn`}
                </b>
                <small>
                  {noFeasibleMachine
                    ? 'Lý do: Không có máy operational đủ công suất cho công đoạn yêu cầu.'
                    : plan?.feasible
                      ? 'Lý do: Máy hiện có đủ thời gian để hoàn tất trước giờ hẹn.'
                      : 'Lý do: Thời gian xử lý dự kiến vượt quá giờ hẹn của khách.'}
                </small>
              </div>
            </div>
            {error && <div className="form-error">{error}</div>}
          </>
        )}
      </div>
      <footer>
        <button className="secondary" onClick={onClose}>
          Hủy
        </button>
        {step === 'plan' && (
          <button
            className="secondary back-button"
            onClick={() => {
              setPlan(null)
              setStep('details')
            }}
          >
            ← Sửa thông tin
          </button>
        )}
        {step === 'details' ? (
          <button
            className="primary"
            disabled={
              loading ||
              !customer.trim() ||
              !phone.trim() ||
              !items.length ||
              items.some((item) => !item.itemType || !item.weight || Number(item.quantity) <= 0)
            }
            onClick={preview}
          >
            {loading ? 'Đang tính lịch xử lý...' : 'Xem lịch xử lý'} <ChevronRight size={15} />
          </button>
        ) : (
          <button className="primary" disabled={loading || !plan?.feasible} onClick={confirm}>
            {loading ? 'Đang tạo đơn...' : 'Xác nhận và tạo đơn'} <Check size={15} />
          </button>
        )}
      </footer>
    </ModalFrame>
  )
}
