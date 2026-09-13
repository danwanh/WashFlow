import {
  AlertTriangle,
  Check,
  CheckCircle2,
  ChevronRight,
  CircleHelp,
  Clock3,
  FileText,
  MessageCircle,
  Plus,
  X,
} from 'lucide-react'
import { useEffect, useState } from 'react'
import {
  createOrder,
  draftReadyNotification,
  getOrder,
  previewOrder,
  type CreatedOrder,
  type PlanResponse,
  type ServiceType,
} from '../../api'
import type { Task } from '../../types/task'

const friendlyBatchStatus: Record<string, string> = {
  WAITING: 'Đang chờ xử lý',
  WASHING: 'Đang giặt',
  DRYING: 'Đang sấy',
  WAITING_FOR_UNLOAD: 'Chờ dỡ đồ',
  COMPLETED: 'Đã hoàn tất',
}
const serviceLabel: Record<string, string> = {
  WASH: 'Giặt',
  DRY: 'Sấy',
  WASH_DRY: 'Giặt và sấy',
}

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

export function DetailModal({
  task,
  onClose,
  onAction,
}: {
  task: Task
  onClose: () => void
  onAction?: () => void
}) {
  const [order, setOrder] = useState<Awaited<ReturnType<typeof getOrder>> | null>(null)
  const [error, setError] = useState('')
  useEffect(() => {
    if (!task.orderId) return
    void getOrder(task.orderId)
      .then(setOrder)
      .catch((cause) =>
        setError(cause instanceof Error ? cause.message : 'Không thể tải chi tiết đơn'),
      )
  }, [task.orderId])
  const formatTime = (value: string) =>
    new Date(value).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })
  const stepFor = (batch: NonNullable<typeof order>['batches'][number]) => {
    if (order?.status === 'RECEIVED') return 1
    if (order?.status === 'FOLDING_PACKING') return 4
    if (order?.status === 'READY' || order?.status === 'COMPLETED') return 5
    if (batch.status === 'COMPLETED') return 4
    const active = batch.stages.find((stage) => stage.status !== 'COMPLETED')
    if (!active) return 4
    return active.stage === 'WASH' ? 2 : 3
  }
  const actionLabel = () => {
    if (!order) return 'Đang tải...'
    if (order.status === 'RECEIVED') return 'Đã phân loại'
    if (order.status === 'FOLDING_PACKING') return 'Đã xếp đồ'
    if (order.status === 'READY') return 'Gửi tin khách'
    const active =
      order.batches
        .find((batch) => batch.batch_id === task.batchId)
        ?.stages.find((stage) => stage.batch_stage_id === task.batchStageId) ??
      order.batches.flatMap((batch) => batch.stages).find((stage) => stage.status !== 'COMPLETED')
    if (!active) return 'Đang xử lý'
    if (active.status === 'MACHINE_FINISHED') return 'Đã lấy đồ'
    if (active.status === 'IN_PROGRESS')
      return active.stage === 'WASH' ? 'Đã giặt xong' : 'Đã sấy xong'
    return active.stage === 'WASH' ? 'Giặt' : 'Sấy'
  }
  const statusText =
    order?.status === 'READY'
      ? 'Sẵn sàng lấy'
      : order?.status === 'FOLDING_PACKING'
        ? 'Đang xếp đồ'
        : order?.status === 'WAITING'
          ? 'Đang xử lý'
          : 'Mới tiếp nhận'
  return (
    <ModalFrame
      title={`Đơn #${task.id} · ${task.customer}`}
      onClose={onClose}
      className="compact-detail-modal"
    >
      <div className="compact-detail-body">
        <div className="compact-summary">
          <div>
            <small>{statusText.toUpperCase()}</small>
            <b>{order ? `${order.batches.length} mẻ xử lý độc lập` : 'Đang tải chi tiết...'}</b>
            <span>
              {order
                ? `${serviceLabel[order.service_type] ?? 'Xử lý'} · ${order.total_weight_kg.toFixed(1)}kg`
                : ''}
            </span>
          </div>
          <div className="compact-deadline">
            <small>HẠN GIAO</small>
            <strong>{order ? formatTime(order.pickup_at) : task.due}</strong>
            <span>
              {order && new Date(order.estimated_at) > new Date(order.pickup_at)
                ? 'Có nguy cơ trễ'
                : 'Đúng hẹn'}
            </span>
          </div>
        </div>
        {error && <p className="queue-error">{error}</p>}
        <div className="compact-groups">
          {order?.batches.map((batch) => {
            const active = batch.stages.find((stage) => stage.status !== 'COMPLETED')
            const stageName =
              active?.stage === 'WASH'
                ? 'Đang giặt'
                : active?.stage === 'DRY'
                  ? 'Đang sấy'
                  : 'Đã hoàn tất máy'
            const allocatedItems = batch.batch_items
              .map((allocation) => {
                const item = order.items.find(
                  (candidate) => candidate.order_item_id === allocation.order_item_id,
                )
                return item
                  ? `${item.item_type} · ${item.quantity} món`
                  : `Nhóm #${allocation.order_item_id}`
              })
              .join(', ')
            const machineName = active?.machine_name ? ` · ${active.machine_name}` : ''
            return (
              <Progress
                key={batch.batch_id}
                title={`Mẻ ${batch.batch_no} · ${batch.weight_kg.toFixed(1)}kg`}
                status={`${allocatedItems || stageName} · ${friendlyBatchStatus[batch.status] ?? 'Đang xử lý'}${machineName}`}
                tone={active?.stage === 'DRY' ? 'amber' : 'blue'}
                current={stepFor(batch)}
              />
            )
          })}
        </div>
        <div className="compact-next">
          <CircleHelp size={16} />
          <span>
            <b>Tiếp theo</b> ·{' '}
            {order?.status === 'READY'
              ? 'Kiểm tra nội dung rồi gửi tin khách.'
              : 'Hoàn tất các mẻ còn lại theo thứ tự ưu tiên.'}
          </span>
        </div>
      </div>
      <footer>
        <button className="secondary" onClick={onClose}>
          Đóng
        </button>
        <button className="primary" disabled={!onAction || !order} onClick={onAction}>
          {actionLabel()} <ChevronRight size={14} />
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

export function ConfirmActionModal({
  title,
  message,
  action,
  onClose,
  onConfirm,
}: {
  title: string
  message: string
  action: string
  onClose: () => void
  onConfirm: () => void
}) {
  return (
    <ModalFrame title={title} onClose={onClose}>
      <div className="scenario-body">
        <div className="scenario-result">
          <CheckCircle2 size={18} />
          <span>{message}</span>
        </div>
      </div>
      <footer>
        <button className="secondary" onClick={onClose}>
          Hủy
        </button>
        <button className="primary" onClick={onConfirm}>
          {action}
        </button>
      </footer>
    </ModalFrame>
  )
}

export function NotificationModal({
  orderId,
  customer,
  onClose,
  onSend,
}: {
  orderId: number
  customer: string
  onClose: () => void
  onSend: (content: string) => void
}) {
  const [content, setContent] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  useEffect(() => {
    void draftReadyNotification(orderId)
      .then((draft) => setContent(draft.content))
      .catch((cause) => setError(cause instanceof Error ? cause.message : 'Không thể tạo tin nhắn'))
      .finally(() => setLoading(false))
  }, [orderId])
  return (
    <ModalFrame title="Gửi tin khách hàng" onClose={onClose}>
      <div className="scenario-body notify">
        <h3>
          Đơn #{orderId} · {customer}
        </h3>
        <div className="scenario-result">
          <MessageCircle size={18} />
          <span>Kiểm tra nội dung trước khi gửi thông báo hoàn tất.</span>
        </div>
        <textarea
          value={content}
          onChange={(event) => setContent(event.target.value)}
          disabled={loading}
          aria-label="Nội dung thông báo"
        />
        {error && <p className="queue-error">{error}</p>}
      </div>
      <footer>
        <button className="secondary" onClick={onClose}>
          Hủy
        </button>
        <button
          className="primary"
          disabled={loading || !content.trim() || Boolean(error)}
          onClick={() => onSend(content.trim())}
        >
          Gửi tin khách
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
