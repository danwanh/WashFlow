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
  WAITING: 'Waiting',
  WASHING: 'Washing',
  DRYING: 'Drying',
  WAITING_FOR_UNLOAD: 'Waiting to unload',
  COMPLETED: 'Completed',
}
const serviceLabel: Record<string, string> = {
  WASH: 'Wash',
  DRY: 'Dry',
  WASH_DRY: 'Wash & dry',
}
const stageLabels: Record<string, string> = {
  CLASSIFY: 'Sorting',
  WASH: 'Wash',
  DRY: 'Dry',
  PACKING: 'Packing',
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
  if (stage.status === 'MACHINE_FINISHED') return 'Unloaded'
  if (stage.status === 'IN_PROGRESS') return 'Machine finished'
  if (stage.stage === 'CLASSIFY') return 'Finish sorting'
  if (stage.stage === 'PACKING') return 'Finish packing'
  return `Load ${stage.machine_name ?? (stage.stage === 'WASH' ? 'washer' : 'dryer')}`
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
        setError(cause instanceof Error ? cause.message : 'Could not load order details'),
      )
  }, [task.orderId])
  const formatTime = (value: string) =>
    new Date(value).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
  const formatDateTime = (value: string) =>
    new Date(value).toLocaleString('en-GB', {
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
          ? `${requestError.message}. Earliest possible time: ${formatDateTime(earliest)}.`
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
                ? 'Cannot change the time: some stages have no suitable machine.'
                : preview.earliest_feasible_pickup
                  ? `The new pickup time is not feasible. Earliest possible time: ${formatDateTime(preview.earliest_feasible_pickup)}.`
                  : 'The new pickup time is not feasible with the current schedule.',
            )
          }
        })
        .catch((cause) =>
          setError(cause instanceof Error ? cause.message : 'Could not check the schedule'),
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
      ? { label: 'Notify customer', value: { kind: 'notify', orderId: task.orderId } }
      : targetStage
        ? {
            label: `Batch ${targetStage.batch.batch_no} · ${stageActionLabel(targetStage.stage)}`,
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
      setError(cause instanceof Error ? cause.message : 'Could not perform the action')
    } finally {
      setActing(false)
    }
  }
  const statusText =
    {
      RECEIVED: 'Received',
      WAITING: 'Processing',
      FOLDING_PACKING: 'Packing',
      READY: 'Ready for pickup',
      COMPLETED: 'Completed',
    }[order?.status ?? ''] ?? 'Loading'
  return (
    <ModalFrame
      title={`Order #${task.id} · ${order?.customer.name ?? task.customer}`}
      onClose={onClose}
      className="compact-detail-modal"
    >
      <div className="compact-detail-body">
        <div className={`compact-summary ${editingPickup ? 'editing' : ''}`}>
          <div>
            <small>{statusText.toUpperCase()}</small>
            <b>{order ? `${order.batches.length} independent batches` : 'Loading details...'}</b>
            <span>
              {order
                ? `${serviceLabel[order.service_type] ?? 'Service'} · ${order.total_weight_kg.toFixed(1)}kg`
                : ''}
            </span>
          </div>
          <div className="compact-deadline">
            <small>PICKUP</small>
            <span>
              {order && new Date(order.estimated_at) > new Date(order.pickup_at)
                ? 'At risk of being late'
                : 'On time'}
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
                    Use earliest time · {formatDateTime(pickupPreview.earliest_feasible_pickup)}
                  </button>
                )}
                <div className="pickup-edit-actions">
                  <button
                    className="pickup-save-button"
                    disabled={savingPickup || previewLoading || !pickupPreview?.feasible}
                    onClick={() => void savePickupTime()}
                  >
                    {savingPickup ? 'Checking...' : 'Save new time'}
                  </button>
                  <button
                    className="pickup-cancel-button"
                    disabled={savingPickup}
                    onClick={() => {
                      setEditingPickup(false)
                      setError('')
                    }}
                  >
                    Cancel
                  </button>
                </div>
                {previewLoading && (
                  <small className="pickup-preview-status">
                    Checking affected orders...
                  </small>
                )}
                {pickupPreview && (
                  <div className="pickup-affected-orders">
                    <b>Affected orders</b>
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
                            {affected.relation === 'changing' && <em>Changing time</em>}
                            {affected.relation === 'rescheduled' && <em>Rescheduled</em>}
                          </div>
                          <small className="pickup-affected-order-time">
                            Pickup {affected.pickup_at ? formatDateTime(affected.pickup_at) : '--:--'}{' '}
                            · Expected done {formatDateTime(affected.estimated_at)}
                          </small>
                          <small
                            className={`pickup-affected-order-status ${affected.late && !affected.preexisting_late ? 'late' : ''}`}
                          >
                            {affected.preexisting_late
                              ? 'Already late before the change'
                              : affected.late
                                ? 'At risk of being late'
                                : 'On time'}
                          </small>
                        </div>
                      ))
                    ) : (
                      <small>No other orders are affected.</small>
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
                <Clock3 size={13} /> Change pickup time
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
                return item ? `${item.item_type} · ${item.quantity} pcs` : ''
              })
              .filter(Boolean)
              .join(', ')
            const current = active
              ? `${stageLabels[active.stage] ?? active.stage}${active.machine_name ? ` · ${active.machine_name}` : ''}`
              : 'Completed'
            return (
              <Progress
                key={batch.batch_id}
                title={`Batch ${batch.batch_no} · ${batch.weight_kg.toFixed(1)}kg`}
                status={`${allocatedItems ? `${allocatedItems} · ` : ''}${friendlyBatchStatus[batch.status] ?? 'Processing'} · ${current}`}
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
            <b>Next</b> ·{' '}
            {order?.status === 'READY'
              ? 'Review the message, then notify the customer.'
              : 'Finish the remaining batches in priority order.'}
          </span>
        </div>
      </div>
      <footer>
        <button className="secondary" onClick={onClose}>
          Close
        </button>
        {action && onAction && (
          <button className="primary" disabled={acting} onClick={() => void runAction()}>
            {acting ? 'Updating...' : action.label} <ChevronRight size={14} />
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
                  ? `Done ${formatClock(stage.actual_ended_at)}`
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
          Cancel
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
      .catch((cause) => setError(cause instanceof Error ? cause.message : 'Could not create the message'))
      .finally(() => setLoading(false))
  }, [orderId])
  return (
    <ModalFrame title="Notify customer" onClose={onClose}>
      <div className="scenario-body notify">
        <h3>
          Order #{orderId} · {customer}
        </h3>
        <div className="scenario-result">
          <MessageCircle size={18} />
          <span>Review the message before sending the completion notice.</span>
        </div>
        <textarea
          value={content}
          onChange={(event) => setContent(event.target.value)}
          disabled={loading}
          aria-label="Message content"
        />
        {error && <p className="queue-error">{error}</p>}
      </div>
      <footer>
        <button className="secondary" onClick={onClose}>
          Cancel
        </button>
        <button
          className="primary"
          disabled={loading || !content.trim() || Boolean(error)}
          onClick={() => onSend(content.trim())}
        >
          Notify customer
        </button>
      </footer>
    </ModalFrame>
  )
}

type Item = { id: number; itemType: string; quantity: string; weight: string; note: string }
const quickItemTypes = [
  'Whites',
  'Colors',
  'Towels / heavy',
  'Sportswear',
  'Delicate',
  'Special',
]
const groupNames: Record<string, string> = {
  WHITE_NORMAL: 'Regular whites',
  LIGHT_NORMAL: 'Light colors',
  DARK_NORMAL: 'Dark colors',
  BLACK_NORMAL: 'Blacks',
  TOWEL_HEAVY: 'Towels & heavy items',
  JEANS_HEAVY: 'Jeans & thick items',
  SPORT: 'Sportswear',
  DELICATE: 'Delicates',
  SPECIAL: 'Special care',
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
    { id: 1, itemType: 'Whites', quantity: '1', weight: '1.5', note: '' },
  ])
  const [plan, setPlan] = useState<PlanResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const totalWeight = items.reduce((sum, item) => sum + Number(item.weight || 0), 0)
  const totalItems = items.reduce((sum, item) => sum + Number(item.quantity || 0), 0)
  const estimated = plan?.estimated_at
    ? new Date(plan.estimated_at).toLocaleTimeString('en-GB', {
        hour: '2-digit',
        minute: '2-digit',
      })
    : '--:--'
  const noFeasibleMachine = plan?.warnings.includes('NO_FEASIBLE_MACHINE')
  const ownLate = plan?.warnings.includes('PICKUP_TOO_EARLY')
  const delayedOrders = plan?.affected_orders ?? []
  const earliestPickup = plan?.earliest_feasible_pickup
    ? new Date(plan.earliest_feasible_pickup).toLocaleString('en-GB', {
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
      'Whites': 'white',
      'Colors': 'color',
      'Towels / heavy': 'towel',
      'Sportswear': 'sport',
      'Delicate': 'delicate',
      'Special': 'special',
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
      setError(cause instanceof Error ? cause.message : 'Could not create a trial plan')
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
      setError(cause instanceof Error ? cause.message : 'Could not create the order')
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
      ? `${item.itemType || 'Unspecified item type'} · ${item.quantity} pcs · ${Number(item.weight || 0).toFixed(1)} kg`
      : 'Unspecified item type'
  }
  return (
    <ModalFrame
      title={step === 'details' ? 'New order' : 'Confirm order'}
      onClose={onClose}
      className="create-modal-v1 create-order-spec-modal"
      icon={<Plus size={18} />}
    >
      <div className="modal-body create-order-body">
        <div className="spec-stepper">
          <span className={step === 'details' ? 'active' : 'done'}>
            <b>{step === 'details' ? '1' : '✓'}</b> Order details
          </span>
          <i className={step === 'plan' ? 'done' : ''} />
          <span className={step === 'plan' ? 'active' : ''}>
            <b>2</b> Schedule
          </span>
        </div>
        {step === 'details' ? (
          <>
            <div className="create-fields">
              <label>
                Customer name *
                <input
                  value={customer}
                  onChange={(e) => setCustomer(e.target.value)}
                  placeholder="Enter customer name"
                />
              </label>
              <label>
                Phone number
                <input
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="0901 234 567"
                />
              </label>
            </div>
            <div className="create-fields">
              <label>
                Service *
                <select value={service} onChange={(e) => setService(e.target.value as ServiceType)}>
                  <option value="WASH">Wash</option>
                  <option value="DRY">Dry</option>
                  <option value="WASH_DRY">Wash + Dry</option>
                </select>
              </label>
              <label>
                Pickup date *
                <input
                  className="date-input"
                  type="date"
                  min={todayInputValue()}
                  value={pickupDate}
                  onChange={(e) => setPickupDate(e.target.value)}
                />
              </label>
              <label>
                Pickup time *
                <input
                  className="time-input"
                  type="time"
                  value={pickupAt}
                  onChange={(e) => setPickupAt(e.target.value)}
                />
              </label>
              <label>
                Total price
                <input
                  type="number"
                  min="0"
                  step="1000"
                  value={totalAmount}
                  onChange={(e) => setTotalAmount(e.target.value)}
                  placeholder="Auto-calculated by kg"
                />
              </label>
            </div>
            <div className="field-block">
              <div className="field-heading">
                <label>Items *</label>
                <span>
                  {totalItems} pcs · {totalWeight.toFixed(1)} kg
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
                      aria-label="Item type"
                      value={item.itemType}
                      onChange={(e) => update(item.id, 'itemType', e.target.value)}
                      placeholder="Item type"
                    />
                    <input
                      aria-label="Quantity"
                      type="number"
                      min="1"
                      value={item.quantity}
                      onChange={(e) => update(item.id, 'quantity', e.target.value)}
                      placeholder="SL"
                    />
                    <input
                      aria-label="Weight"
                      type="number"
                      min="0"
                      step="0.1"
                      value={item.weight}
                      onChange={(e) => update(item.id, 'weight', e.target.value)}
                      placeholder="Kg"
                    />
                    <input
                      aria-label="Item note"
                      value={item.note}
                      onChange={(e) => update(item.id, 'note', e.target.value)}
                      placeholder="Note"
                    />
                    <button
                      className="remove-item"
                      type="button"
                      onClick={() =>
                        setItems((current) => current.filter((entry) => entry.id !== item.id))
                      }
                      aria-label="Remove item"
                    >
                      <X size={15} />
                    </button>
                  </div>
                ))}
              </div>
              <button className="add-item-button" type="button" onClick={() => addItem()}>
                + Add item type
              </button>
            </div>
            <label className="special-note">
              Special instructions
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="E.g. no fabric softener, handle separately..."
              />
            </label>
            {error && <div className="form-error">{error}</div>}
          </>
        ) : (
          <>
            <div className="plan-summary">
              <div>
                <small>CUSTOMER</small>
                <b>{customer || 'No name entered'}</b>
                <span>{phone || 'No phone number'}</span>
              </div>
              <div>
                <small>SERVICE</small>
                <b>{service === 'WASH' ? 'Wash' : service === 'DRY' ? 'Dry' : 'Wash + Dry'}</b>
                <span>Pickup at {pickupAt}</span>
              </div>
            </div>
            <div className="plan-section">
              <div className="plan-section-heading">
                <b>1. Compatibility groups</b>
                <em>{plan?.compatibility_groups.length ?? 0} groups</em>
              </div>
              {plan?.compatibility_groups.map((group, index) => (
                <div className="plan-group" key={group.group}>
                  <span className={`group-dot ${index % 2 ? 'amber-dot' : 'blue-dot'}`} />
                  <div>
                    <b>
                      Group {index + 1} · {groupNames[group.group] ?? group.group}
                    </b>
                    <small>{group.itemIndices.map(description).join(' | ')}</small>
                  </div>
                  <strong>
                    {plan.batches.filter((batch) => batch.group === group.group).length} batches
                  </strong>
                </div>
              ))}
            </div>
            <div className="plan-section">
              <div className="plan-section-heading">
                <b>2. Schedule per batch</b>
              </div>
              {plan?.batches.map((batch) => (
                <div className="batch-schedule" key={batch.batchNo}>
                  <div className="batch-schedule-heading">
                    <div>
                      <b>
                        Batch {batch.batchNo} · {groupNames[batch.group] ?? batch.group}
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
                            ? 'Manual'
                            : `${stage.stage === 'WASH' ? 'Washer' : 'Dryer'} #${stage.machineId}`}
                        </b>
                        <span>
                          {new Date(stage.plannedStartAt).toLocaleTimeString('en-GB', {
                            hour: '2-digit',
                            minute: '2-digit',
                          })}{' '}
                          -{' '}
                          {new Date(stage.plannedEndAt).toLocaleTimeString('en-GB', {
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
                    ? 'Cannot schedule · No suitable machine'
                    : plan?.feasible
                      ? `Feasible · Expected done ${estimated} · On time`
                      : ownLate
                        ? `Not feasible · Expected done ${estimated}, after pickup time`
                        : `Not feasible · Would make ${delayedOrders.length} on-time orders late`}
                </b>
                <small>
                  {noFeasibleMachine
                    ? 'Reason: No operational machine has enough capacity for the required stage.'
                    : plan?.feasible
                      ? 'Reason: The machines have enough time to finish before the pickup time.'
                      : ownLate
                        ? 'Reason: The expected processing time runs past the customer pickup time.'
                        : `Reason: Prioritizing this order would make ${delayedOrders
                            .map((order) => `#${order.order_id} ${order.customer}`)
                            .join(', ')} late.`}
                  {!plan?.feasible && earliestPickup && (
                    <> Earliest possible pickup: {earliestPickup}.</>
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
          Cancel
        </button>
        {step === 'plan' && (
          <button
            className="secondary back-button"
            onClick={() => {
              setPlan(null)
              setStep('details')
            }}
          >
            ← Edit details
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
            {loading ? 'Calculating schedule...' : 'View schedule'} <ChevronRight size={15} />
          </button>
        ) : (
          <button className="primary" disabled={loading || !plan?.feasible} onClick={confirm}>
            {loading ? 'Creating order...' : 'Confirm and create order'} <Check size={15} />
          </button>
        )}
      </footer>
    </ModalFrame>
  )
}

const stageName: Record<MaintenanceStage['stage'], string> = {
  CLASSIFY: 'Sorting',
  WASH: 'Wash',
  DRY: 'Dry',
  PACKING: 'Packing',
}
const clockTime = (value: string) =>
  new Date(value).toLocaleString('en-GB', {
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
      ? `→ ${stage.new_machine_name}${stage.new_planned_start_at ? ` at ${clockTime(stage.new_planned_start_at)}` : ''}`
      : '→ No suitable machine yet'
  const stageLabel = (stage: MaintenanceStage) =>
    `#${stage.order_id} · ${stage.customer} · ${stageName[stage.stage]}`
  const nothing =
    !impact.stopped &&
    !impact.moved.length &&
    !impact.unscheduled.length &&
    !impact.late_orders.length
  return (
    <ModalFrame
      title={`Put ${machineName} into maintenance`}
      onClose={onClose}
      icon={<Wrench size={18} />}
    >
      <div className="scenario-body maintenance-impact">
        {nothing && (
          <div className="scenario-result">
            <CheckCircle2 size={18} />
            <span>No batches or orders are affected.</span>
          </div>
        )}
        {impact.stopped && (
          <div className="pickup-affected-orders maintenance-stopped">
            <b>The running batch will be stopped</b>
            <div>
              <span>{stageLabel(impact.stopped)}</span>
              <small>Unload the machine; the batch goes back to waiting and restarts from the beginning.</small>
              <small>{nextMachine(impact.stopped)}</small>
            </div>
          </div>
        )}
        {impact.moved.length > 0 && (
          <div className="pickup-affected-orders">
            <b>Batches moved to another machine</b>
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
            <b>Batches with no machine left</b>
            {impact.unscheduled.map((stage) => (
              <div key={stage.batch_stage_id}>
                <span>{stageLabel(stage)}</span>
                <small className="late">Waiting until a suitable machine is back in service</small>
              </div>
            ))}
          </div>
        )}
        {impact.late_orders.length > 0 && (
          <div className="pickup-affected-orders">
            <b>Orders that will be late</b>
            {impact.late_orders.map((order) => (
              <div key={order.order_id}>
                <span>
                  #{order.order_id} · {order.customer}
                </span>
                <small className="late">
                  Pickup {order.pickup_at ? clockTime(order.pickup_at) : '--:--'} · Expected done{' '}
                  {clockTime(order.estimated_at)}
                </small>
              </div>
            ))}
          </div>
        )}
      </div>
      <footer>
        <button className="secondary" onClick={onClose} disabled={saving}>
          Cancel
        </button>
        <button className="primary" onClick={onConfirm} disabled={saving}>
          {saving ? 'Switching...' : 'Confirm maintenance'}
        </button>
      </footer>
    </ModalFrame>
  )
}
