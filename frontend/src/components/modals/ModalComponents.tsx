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
  Wrench,
  X,
} from 'lucide-react'
import { useEffect, useState } from 'react'
import {
  createOrder,
  changePickupTime,
  previewPickupTime,
  draftReadyNotification,
  getOrder,
  previewOrder,
  type CreatedOrder,
  type MaintenancePreview,
  type MaintenanceStage,
  type OrderDetails,
  type PlanResponse,
  type ServiceType,
} from '../../api'
import type { Task } from '../../types/task'
import { formatClock, liveTiming, statusClass } from '../../utils/timing'

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
const stageLabels: Record<string, string> = {
  CLASSIFY: 'Phân loại',
  WASH: 'Giặt',
  DRY: 'Sấy',
  PACKING: 'Đóng gói',
}
const stageOrder = ['CLASSIFY', 'WASH', 'DRY', 'PACKING']
const sortStages = <T extends { stage: string }>(stages: T[]) =>
  [...stages].sort((a, b) => stageOrder.indexOf(a.stage) - stageOrder.indexOf(b.stage))

type OrderStage = OrderDetails['batches'][number]['stages'][number]

// What the detail modal's primary button does.
export type DetailAction =
  | {
      kind: 'stage'
      batchId: number
      batchStageId: number
      endpoint: 'start' | 'machine-finished' | 'unload'
      machineId?: number
    }
  | { kind: 'notify'; orderId: number }

const stageActionLabel = (stage: OrderStage) => {
  if (stage.status === 'MACHINE_FINISHED') return 'Đã lấy đồ ra'
  if (stage.status === 'IN_PROGRESS') return 'Máy đã chạy xong'
  if (stage.stage === 'CLASSIFY') return 'Xong phân loại'
  if (stage.stage === 'PACKING') return 'Xong đóng gói'
  return `Cho vào ${stage.machine_name ?? (stage.stage === 'WASH' ? 'máy giặt' : 'máy sấy')}`
}
const stageEndpoint = (stage: OrderStage): 'start' | 'machine-finished' | 'unload' =>
  stage.status === 'MACHINE_FINISHED'
    ? 'unload'
    : stage.status === 'IN_PROGRESS' || stage.stage === 'CLASSIFY' || stage.stage === 'PACKING'
      ? 'machine-finished'
      : 'start'

const todayInputValue = () => {
  const date = new Date()
  const pad = (number: number) => String(number).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
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
  onPickupChanged,
}: {
  task: Task
  onClose: () => void
  onAction?: (action: DetailAction) => Promise<void>
  onPickupChanged?: (orderId: number, pickupAt: string) => void
}) {
  const [now, setNow] = useState(() => Date.now())
  const [acting, setActing] = useState(false)
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [])
  const [order, setOrder] = useState<Awaited<ReturnType<typeof getOrder>> | null>(null)
  const [error, setError] = useState('')
  const [editingPickup, setEditingPickup] = useState(false)
  const [newPickupAt, setNewPickupAt] = useState('')
  const [savingPickup, setSavingPickup] = useState(false)
  const [pickupPreview, setPickupPreview] = useState<Awaited<
    ReturnType<typeof previewPickupTime>
  > | null>(null)
  const [previewLoading, setPreviewLoading] = useState(false)
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
  const formatDateTime = (value: string) =>
    new Date(value).toLocaleString('vi-VN', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  const localDateTime = (value: string) => {
    const date = new Date(value)
    const pad = (number: number) => String(number).padStart(2, '0')
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
  }
  const savePickupTime = async () => {
    if (!task.orderId || !newPickupAt || !pickupPreview?.feasible) return
    setSavingPickup(true)
    setError('')
    try {
      const response = await changePickupTime(task.orderId, new Date(newPickupAt).toISOString())
      setOrder(response.order)
      setEditingPickup(false)
      onPickupChanged?.(task.orderId, response.order.pickup_at)
    } catch (cause) {
      const requestError = cause as Error & { details?: { earliest_feasible_pickup?: string } }
      const earliest = requestError.details?.earliest_feasible_pickup
      setError(
        earliest
          ? `${requestError.message}. Giờ sớm nhất có thể: ${formatDateTime(earliest)}.`
          : requestError.message,
      )
    } finally {
      setSavingPickup(false)
    }
  }
  useEffect(() => {
    if (!editingPickup || !task.orderId || !newPickupAt || !order) return
    if (new Date(newPickupAt).getTime() === new Date(order.pickup_at).getTime()) return
    const timer = window.setTimeout(() => {
      setPreviewLoading(true)
      setPickupPreview(null)
      setError('')
      void previewPickupTime(task.orderId!, new Date(newPickupAt).toISOString())
        .then((preview) => {
          setPickupPreview(preview)
          if (!preview.feasible) {
            setError(
              preview.unscheduled_stage_ids.length
                ? 'Không thể đổi giờ vì chưa có máy phù hợp cho một số công đoạn.'
                : preview.earliest_feasible_pickup
                  ? `Giờ hẹn mới không khả thi. Giờ sớm nhất có thể: ${formatDateTime(preview.earliest_feasible_pickup)}.`
                  : 'Giờ hẹn mới không khả thi với lịch xử lý hiện tại.',
            )
          }
        })
        .catch((cause) =>
          setError(cause instanceof Error ? cause.message : 'Không thể kiểm tra lịch'),
        )
        .finally(() => setPreviewLoading(false))
    }, 300)
    return () => window.clearTimeout(timer)
  }, [editingPickup, newPickupAt, order, task.orderId])
  // The stage the opened task points at, else the first batch that still has work.
  const targetStage = (() => {
    if (!order) return null
    const batch =
      order.batches.find((item) => item.batch_id === task.batchId) ??
      order.batches.find((item) => item.stages.some((stage) => stage.status !== 'COMPLETED'))
    if (!batch) return null
    const stages = sortStages(batch.stages)
    const stage =
      stages.find(
        (item) => item.batch_stage_id === task.batchStageId && item.status !== 'COMPLETED',
      ) ?? stages.find((item) => item.status !== 'COMPLETED')
    return stage ? { batch, stage } : null
  })()
  const action: { label: string; value: DetailAction } | null = !order
    ? null
    : order.status === 'READY' && task.orderId
      ? { label: 'Gửi tin khách', value: { kind: 'notify', orderId: task.orderId } }
      : targetStage
        ? {
            label: `Mẻ ${targetStage.batch.batch_no} · ${stageActionLabel(targetStage.stage)}`,
            value: {
              kind: 'stage',
              batchId: targetStage.batch.batch_id,
              batchStageId: targetStage.stage.batch_stage_id,
              endpoint: stageEndpoint(targetStage.stage),
              ...(targetStage.stage.machine_id ? { machineId: targetStage.stage.machine_id } : {}),
            },
          }
        : null
  const runAction = async () => {
    if (!action || !onAction) return
    setActing(true)
    setError('')
    try {
      await onAction(action.value)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Không thể thực hiện thao tác')
    } finally {
      setActing(false)
    }
  }
  const statusText =
    {
      RECEIVED: 'Mới tiếp nhận',
      WAITING: 'Đang xử lý',
      FOLDING_PACKING: 'Đang đóng gói',
      READY: 'Sẵn sàng lấy',
      COMPLETED: 'Đã hoàn tất',
    }[order?.status ?? ''] ?? 'Đang tải'
  return (
    <ModalFrame
      title={`Đơn #${task.id} · ${order?.customer.name ?? task.customer}`}
      onClose={onClose}
      className="compact-detail-modal"
    >
      <div className="compact-detail-body">
        <div className={`compact-summary ${editingPickup ? 'editing' : ''}`}>
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
            <span>
              {order && new Date(order.estimated_at) > new Date(order.pickup_at)
                ? 'Có nguy cơ trễ'
                : 'Đúng hẹn'}
            </span>
            {editingPickup ? (
              <div className="pickup-editor">
                <input
                  className="pickup-edit-input"
                  type="datetime-local"
                  value={newPickupAt}
                  onChange={(event) => setNewPickupAt(event.target.value)}
                />
                {pickupPreview?.earliest_feasible_pickup && !pickupPreview.feasible && (
                  <button
                    type="button"
                    className="pickup-earliest-button"
                    onClick={() => {
                      setNewPickupAt(localDateTime(pickupPreview.earliest_feasible_pickup!))
                      setError('')
                    }}
                  >
                    Chọn giờ sớm nhất · {formatDateTime(pickupPreview.earliest_feasible_pickup)}
                  </button>
                )}
                <div className="pickup-edit-actions">
                  <button
                    className="pickup-save-button"
                    disabled={savingPickup || previewLoading || !pickupPreview?.feasible}
                    onClick={() => void savePickupTime()}
                  >
                    {savingPickup ? 'Đang kiểm tra...' : 'Lưu giờ mới'}
                  </button>
                  <button
                    className="pickup-cancel-button"
                    disabled={savingPickup}
                    onClick={() => {
                      setEditingPickup(false)
                      setError('')
                    }}
                  >
                    Hủy
                  </button>
                </div>
                {previewLoading && (
                  <small className="pickup-preview-status">
                    Đang kiểm tra các đơn bị ảnh hưởng...
                  </small>
                )}
                {pickupPreview && (
                  <div className="pickup-affected-orders">
                    <b>Đơn bị ảnh hưởng</b>
                    {pickupPreview.affected_orders.length ? (
                      pickupPreview.affected_orders.map((affected) => (
                        <div
                          key={affected.order_id}
                          className={`pickup-affected-order ${affected.relation ?? 'affected'}`}
                        >
                          <div className="pickup-affected-order-heading">
                            <span>
                              #{affected.order_id} · {affected.customer}
                            </span>
                            {affected.relation === 'changing' && <em>Đang đổi giờ</em>}
                            {affected.relation === 'same_group' && <em>Cùng nhóm</em>}
                          </div>
                          <small className="pickup-affected-order-time">
                            Hẹn {affected.pickup_at ? formatDateTime(affected.pickup_at) : '--:--'}{' '}
                            · Dự kiến xong {formatDateTime(affected.estimated_at)}
                          </small>
                          <small
                            className={`pickup-affected-order-status ${affected.late && !affected.preexisting_late ? 'late' : ''}`}
                          >
                            {affected.preexisting_late
                              ? 'Đã trễ trước khi đổi giờ'
                              : affected.late
                                ? 'Có nguy cơ trễ'
                                : 'Đúng hẹn'}
                          </small>
                        </div>
                      ))
                    ) : (
                      <small>Không có đơn khác bị ảnh hưởng.</small>
                    )}
                  </div>
                )}
              </div>
            ) : (
              <strong>{order ? formatDateTime(order.pickup_at) : task.due}</strong>
            )}
            {!editingPickup && order && order.status !== 'COMPLETED' && (
              <button
                className="table-action pickup-edit-button"
                onClick={() => {
                  setNewPickupAt(localDateTime(order.pickup_at))
                  setPickupPreview(null)
                  setError('')
                  setEditingPickup(true)
                }}
              >
                <Clock3 size={13} /> Đổi giờ hẹn
              </button>
            )}
          </div>
        </div>
        {error && <p className="queue-error">{error}</p>}
        <div className="compact-groups">
          {order?.batches.map((batch) => {
            const stages = sortStages(batch.stages)
            const active = stages.find((stage) => stage.status !== 'COMPLETED')
            const allocatedItems = batch.batch_items
              .map((allocation) => {
                const item = order.items.find(
                  (candidate) => candidate.order_item_id === allocation.order_item_id,
                )
                return item ? `${item.item_type} · ${item.quantity} món` : ''
              })
              .filter(Boolean)
              .join(', ')
            const current = active
              ? `${stageLabels[active.stage] ?? active.stage}${active.machine_name ? ` · ${active.machine_name}` : ''}`
              : 'Đã hoàn tất'
            return (
              <Progress
                key={batch.batch_id}
                title={`Mẻ ${batch.batch_no} · ${batch.weight_kg.toFixed(1)}kg`}
                status={`${allocatedItems ? `${allocatedItems} · ` : ''}${friendlyBatchStatus[batch.status] ?? 'Đang xử lý'} · ${current}`}
                tone={active?.stage === 'DRY' ? 'amber' : 'blue'}
                stages={stages}
                activeId={active?.batch_stage_id ?? null}
                now={now}
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
        {action && onAction && (
          <button className="primary" disabled={acting} onClick={() => void runAction()}>
            {acting ? 'Đang cập nhật...' : action.label} <ChevronRight size={14} />
          </button>
        )}
      </footer>
    </ModalFrame>
  )
}
// Sorting → Washing → Drying → Packing timeline of one batch. Unfinished stages show
// their planned window; finished ones show a checkmark and the actual completion time.
function Progress({
  title,
  status,
  tone,
  stages,
  activeId,
  now,
}: {
  title: string
  status: string
  tone: 'blue' | 'amber'
  stages: OrderStage[]
  activeId: number | null
  now: number
}) {
  const lastDone = stages.reduce(
    (last, stage, index) => (stage.status === 'COMPLETED' ? index : last),
    -1,
  )
  const progress = stages.length > 1 ? Math.max(0, lastDone) / (stages.length - 1) : 1
  return (
    <section className={`progress-visual ${tone}`}>
      <div className="progress-visual-heading">
        <b>{title}</b>
        <span>{status}</span>
      </div>
      <div
        className="visual-stepper"
        style={
          {
            '--steps': stages.length,
            '--progress': `${Math.round(progress * 100)}%`,
          } as React.CSSProperties
        }
      >
        {stages.map((stage, index) => {
          const done = stage.status === 'COMPLETED'
          const timing = liveTiming(stage, now, stage.stage)
          const state = done
            ? 'done'
            : stage.status === 'IN_PROGRESS'
              ? 'running'
              : stage.status === 'MACHINE_FINISHED'
                ? 'waiting'
                : stage.batch_stage_id === activeId
                  ? 'current'
                  : 'planned'
          return (
            <div
              className={`visual-step ${state} ${statusClass(timing?.status) === 'late' ? 'late' : ''}`}
              key={stage.batch_stage_id}
            >
              <i>{done ? '✓' : index + 1}</i>
              <small>{stageLabels[stage.stage] ?? stage.stage}</small>
              <em>
                {done
                  ? `Xong ${formatClock(stage.actual_ended_at)}`
                  : `${stage.machine_name ? `${stage.machine_name} · ` : ''}${formatClock(stage.planned_start_at)}–${formatClock(stage.planned_end_at)}`}
              </em>
              {timing && <span>{timing.label}</span>}
            </div>
          )
        })}
      </div>
    </section>
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
  const [pickupDate, setPickupDate] = useState(() => {
    const today = new Date()
    const pad = (value: number) => String(value).padStart(2, '0')
    return `${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}`
  })
  const [pickupAt, setPickupAt] = useState('16:00')
  const [note, setNote] = useState('')
  const [totalAmount, setTotalAmount] = useState('')
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
  const ownLate = plan?.warnings.includes('PICKUP_TOO_EARLY')
  const delayedOrders = plan?.affected_orders ?? []
  const earliestPickup = plan?.earliest_feasible_pickup
    ? new Date(plan.earliest_feasible_pickup).toLocaleString('vi-VN', {
        hour: '2-digit',
        minute: '2-digit',
        day: '2-digit',
        month: '2-digit',
      })
    : null
  const pickupTimestamp = () => {
    const [hours, minutes] = pickupAt.split(':').map(Number)
    const date = new Date(`${pickupDate}T00:00:00`)
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
          total_amount: totalAmount ? Number(totalAmount) : undefined,
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
                Ngày nhận đồ *
                <input
                  className="date-input"
                  type="date"
                  min={todayInputValue()}
                  value={pickupDate}
                  onChange={(e) => setPickupDate(e.target.value)}
                />
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
              <label>
                Tổng tiền
                <input
                  type="number"
                  min="0"
                  step="1000"
                  value={totalAmount}
                  onChange={(e) => setTotalAmount(e.target.value)}
                  placeholder="Tự tính theo kg"
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
                    {sortStages(batch.stages).map((stage) => (
                      <div
                        className={`schedule-stage ${stage.machineId === null ? 'manual' : ''}`}
                        key={`${batch.batchNo}-${stage.stage}`}
                      >
                        <i>{stageLabels[stage.stage] ?? stage.stage}</i>
                        <b>
                          {stage.machineId === null
                            ? 'Thủ công'
                            : `${stage.stage === 'WASH' ? 'Máy giặt' : 'Máy sấy'} #${stage.machineId}`}
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
                      ? `Khả thi · Dự kiến xong ${estimated} · Đúng giờ hẹn`
                      : ownLate
                        ? `Không khả thi · Dự kiến xong ${estimated} sau giờ hẹn`
                        : `Không khả thi · Làm trễ ${delayedOrders.length} đơn đang đúng hẹn`}
                </b>
                <small>
                  {noFeasibleMachine
                    ? 'Lý do: Không có máy operational đủ công suất cho công đoạn yêu cầu.'
                    : plan?.feasible
                      ? 'Lý do: Máy hiện có đủ thời gian để hoàn tất trước giờ hẹn.'
                      : ownLate
                        ? 'Lý do: Thời gian xử lý dự kiến vượt quá giờ hẹn của khách.'
                        : `Lý do: Ưu tiên đơn này sẽ đẩy ${delayedOrders
                            .map((order) => `#${order.order_id} ${order.customer}`)
                            .join(', ')} trễ hẹn.`}
                  {!plan?.feasible && earliestPickup && (
                    <> Giờ hẹn sớm nhất có thể: {earliestPickup}.</>
                  )}
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

const stageName: Record<MaintenanceStage['stage'], string> = {
  CLASSIFY: 'Phân loại',
  WASH: 'Giặt',
  DRY: 'Sấy',
  PACKING: 'Đóng gói',
}
const clockTime = (value: string) =>
  new Date(value).toLocaleString('vi-VN', {
    hour: '2-digit',
    minute: '2-digit',
    day: '2-digit',
    month: '2-digit',
  })

// Shown before a machine goes into maintenance: what happens to the batch in it, the batches
// planned for it, and the orders that would become late.
export function MaintenanceConfirmModal({
  machineName,
  impact,
  saving,
  onClose,
  onConfirm,
}: {
  machineName: string
  impact: MaintenancePreview
  saving: boolean
  onClose: () => void
  onConfirm: () => void
}) {
  const nextMachine = (stage: MaintenanceStage) =>
    stage.new_machine_name
      ? `→ ${stage.new_machine_name}${stage.new_planned_start_at ? ` lúc ${clockTime(stage.new_planned_start_at)}` : ''}`
      : '→ Chưa có máy phù hợp'
  const stageLabel = (stage: MaintenanceStage) =>
    `#${stage.order_id} · ${stage.customer} · ${stageName[stage.stage]}`
  const nothing =
    !impact.stopped &&
    !impact.moved.length &&
    !impact.unscheduled.length &&
    !impact.late_orders.length
  return (
    <ModalFrame
      title={`Chuyển ${machineName} sang bảo trì`}
      onClose={onClose}
      icon={<Wrench size={18} />}
    >
      <div className="scenario-body maintenance-impact">
        {nothing && (
          <div className="scenario-result">
            <CheckCircle2 size={18} />
            <span>Không có mẻ hay đơn nào bị ảnh hưởng.</span>
          </div>
        )}
        {impact.stopped && (
          <div className="pickup-affected-orders maintenance-stopped">
            <b>Mẻ đang chạy sẽ bị dừng</b>
            <div>
              <span>{stageLabel(impact.stopped)}</span>
              <small>Lấy đồ ra khỏi máy; mẻ quay về chờ vào máy và chạy lại từ đầu.</small>
              <small>{nextMachine(impact.stopped)}</small>
            </div>
          </div>
        )}
        {impact.moved.length > 0 && (
          <div className="pickup-affected-orders">
            <b>Mẻ chuyển sang máy khác</b>
            {impact.moved.map((stage) => (
              <div key={stage.batch_stage_id}>
                <span>{stageLabel(stage)}</span>
                <small>{nextMachine(stage)}</small>
              </div>
            ))}
          </div>
        )}
        {impact.unscheduled.length > 0 && (
          <div className="pickup-affected-orders">
            <b>Mẻ không còn máy để chạy</b>
            {impact.unscheduled.map((stage) => (
              <div key={stage.batch_stage_id}>
                <span>{stageLabel(stage)}</span>
                <small className="late">Chờ đến khi có máy phù hợp hoạt động trở lại</small>
              </div>
            ))}
          </div>
        )}
        {impact.late_orders.length > 0 && (
          <div className="pickup-affected-orders">
            <b>Đơn sẽ trễ hẹn</b>
            {impact.late_orders.map((order) => (
              <div key={order.order_id}>
                <span>
                  #{order.order_id} · {order.customer}
                </span>
                <small className="late">
                  Hẹn {order.pickup_at ? clockTime(order.pickup_at) : '--:--'} · Dự kiến xong{' '}
                  {clockTime(order.estimated_at)}
                </small>
              </div>
            ))}
          </div>
        )}
      </div>
      <footer>
        <button className="secondary" onClick={onClose} disabled={saving}>
          Hủy
        </button>
        <button className="primary" onClick={onConfirm} disabled={saving}>
          {saving ? 'Đang chuyển...' : 'Xác nhận bảo trì'}
        </button>
      </footer>
    </ModalFrame>
  )
}
