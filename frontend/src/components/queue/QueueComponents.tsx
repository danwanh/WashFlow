import { AlertTriangle, Check, Clock, MessageCircle, PackageCheck, Tags } from 'lucide-react'
import type { DragEvent, ReactNode } from 'react'
import type { QueueTask } from '../../api'
import type { Task } from '../../types/task'
import { formatClock, formatMinutes, liveTiming, statusClass } from '../../utils/timing'

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

function TaskIcon({ actionType }: { actionType?: Task['actionType'] }) {
  if (actionType === 'CLASSIFY') return <Tags size={24} strokeWidth={1.8} />
  if (actionType === 'PACK') return <PackageCheck size={24} strokeWidth={1.8} />
  if (actionType === 'NOTIFY') return <MessageCircle size={24} strokeWidth={1.8} />
  if (actionType === 'START' || actionType === 'MACHINE_FINISHED' || actionType === 'UNLOAD') {
    return <LaundryBagIcon />
  }
  return <LaundryBagIcon />
}

function ActionButtonIcon({ actionType }: { actionType?: Task['actionType'] }) {
  if (actionType === 'NOTIFY') return <MessageCircle size={15} />
  if (actionType === 'PACK') return <PackageCheck size={15} />
  if (actionType === 'CLASSIFY') return <Tags size={15} />
  return <Check size={15} />
}

export function TaskCard({
  task,
  now,
  onClick,
  onComplete,
  onDragStart,
  onDragEnd,
  canAcceptUnload,
  unloadDropTarget,
  onUnloadDragOver,
  onUnloadDrop,
}: {
  task: Task
  now: number
  onClick: () => void
  onComplete: () => void
  onDragStart: () => void
  onDragEnd: () => void
  canAcceptUnload?: boolean
  unloadDropTarget?: boolean
  onUnloadDragOver?: () => void
  onUnloadDrop?: () => void
}) {
  const canDrag =
    task.stageStatus === 'PLANNED' &&
    task.action.includes('VÀO MÁY') &&
    (!task.plannedStartAt || new Date(task.plannedStartAt).getTime() <= now)
  const timing = liveTiming(task.timing, now, task.stage)
  // Passed pickup is a stronger state than an ETA that is merely late.
  const due = task.dueAt ? new Date(task.dueAt).getTime() : null
  const pickupOverdue = due !== null && now > due ? Math.ceil((now - due) / 60_000) : 0
  const etaLate = pickupOverdue ? 0 : (task.orderLateMinutes ?? 0)
  const phase = task.timing?.phase
  const planNote = !task.stage
    ? null
    : phase === 'RUNNING'
      ? `Xong dự kiến ${formatClock(task.timing?.expected_end_at)}`
      : phase === 'WAITING_UNLOAD'
        ? `Máy xong lúc ${formatClock(task.timing?.expected_end_at)}`
        : task.stage === 'WASH' || task.stage === 'DRY'
          ? `Kế hoạch ${formatClock(task.plannedStartAt)}–${formatClock(task.plannedEndAt)}`
          : null
  return (
    <article
      className={`task-card ${task.rank === 1 ? 'selected' : ''} ${pickupOverdue ? 'pickup-overdue' : ''} ${canAcceptUnload ? 'unload-target' : ''} ${unloadDropTarget ? 'unload-drop-target' : ''}`}
      onClick={onClick}
      onDragOver={(event) => {
        if (!canAcceptUnload) return
        event.preventDefault()
        event.dataTransfer.dropEffect = 'move'
        onUnloadDragOver?.()
      }}
      onDrop={(event) => {
        if (!canAcceptUnload) return
        event.preventDefault()
        event.stopPropagation()
        onUnloadDrop?.()
      }}
    >
      <div className="rank">
        {task.rank === 1 && <span>★</span>}
        <b>{task.rank}</b>
      </div>
      <div
        className={`bag ${task.tone} ${canDrag ? 'draggable-bag' : ''}`}
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
        <TaskIcon actionType={task.actionType} />
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
        </div>
        {(pickupOverdue > 0 || etaLate > 0) && (
          <div className="task-flags">
            {pickupOverdue > 0 ? (
              <span className="pickup-overdue-badge">
                <AlertTriangle size={13} /> Trễ giờ hẹn {formatMinutes(pickupOverdue)}
              </span>
            ) : (
              <span className="task-timing late order-late">
                <AlertTriangle size={13} /> Nguy cơ trễ hẹn {formatMinutes(etaLate)}
              </span>
            )}
          </div>
        )}
      </div>
      <div className="task-action">
        {timing && (
          <div className={`task-timing ${statusClass(timing.status)}`}>
            <Clock size={13} /> {timing.label}
          </div>
        )}
        {planNote && <small className="task-plan">{planNote}</small>}
        {task.button &&
          (['✓  Xong', 'Xong', 'Máy xong', 'Gửi tin khách'].includes(task.button) ? (
            <button
              className="done"
              onClick={(event) => {
                event.stopPropagation()
                onComplete()
              }}
            >
              <ActionButtonIcon actionType={task.actionType} />
              {task.actionType === 'NOTIFY'
                ? 'Gửi tin khách'
                : task.button === 'Máy xong'
                  ? 'Máy xong'
                  : 'Xong'}
            </button>
          ) : null)}
        {canDrag && <small className="drag-hint">Kéo túi vào máy phù hợp</small>}
        {canAcceptUnload ? (
          <small className="drag-hint unload-hint">Thả túi từ máy vào đây</small>
        ) : (
          task.stageStatus === 'MACHINE_FINISHED' && (
            <small className="drag-hint unload-hint">Kéo túi từ máy về dòng này</small>
          )
        )}
      </div>
    </article>
  )
}

function MachineIcon({ tone }: { tone: string }) {
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
          className="drum-ring"
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

export function MachinePane({
  machines,
  now,
  canDrop,
  dropTarget,
  onDragOver,
  onDrop,
  onUnloadDragStart,
  onUnloadDragEnd,
  widthPercent,
}: {
  machines: Array<{
    machine_id: number
    name: string
    type: 'WASHER' | 'DRYER'
    status: string
    active_task: QueueTask | null
  }>
  now: number
  canDrop: (machine: string) => boolean
  dropTarget: string | null
  onDragOver: (machine: string) => void
  onDrop: (machine: string) => void
  onUnloadDragStart: (task: QueueTask) => void
  onUnloadDragEnd: () => void
  widthPercent?: number
}) {
  const washers = machines.filter((machine) => machine.type === 'WASHER')
  const dryers = machines.filter((machine) => machine.type === 'DRYER')
  const machineState = (status: string) =>
    ({
      AVAILABLE: 'Trống',
      BUSY: 'Đang chạy',
      OFFLINE: 'Ngoại tuyến',
      MAINTENANCE: 'Bảo trì',
    })[status] ?? 'Không rõ'
  const renderMachine = (machine: (typeof machines)[number]) => {
    const validDrop = canDrop(machine.name)
    // Running: counts down (or overdue). Finished: stops spinning and shows the bag to drag back.
    const timing = liveTiming(machine.active_task ?? undefined, now, machine.active_task?.stage)
    const finished = machine.active_task?.stage_status === 'MACHINE_FINISHED'
    return (
      <Machine
        key={machine.machine_id}
        title={machine.name}
        state={timing?.label ?? machineState(machine.status)}
        tone={`${
          finished
            ? 'amber'
            : machine.status === 'AVAILABLE'
              ? 'empty'
              : machine.status === 'BUSY'
                ? 'blue'
                : 'offline'
        } ${timing?.status === 'LATE' ? 'late' : ''}`}
        dropTarget={dropTarget === machine.name}
        validDrop={validDrop}
        onDragOver={() => onDragOver(machine.name)}
        canDrop={canDrop(machine.name)}
        activeTask={machine.active_task}
        onDragStart={() => machine.active_task && onUnloadDragStart(machine.active_task)}
        onDragEnd={onUnloadDragEnd}
        onDrop={() => onDrop(machine.name)}
      />
    )
  }
  return (
    <aside
      className="machines-pane"
      style={
        widthPercent === undefined
          ? undefined
          : { width: `${widthPercent}%`, flexBasis: `${widthPercent}%` }
      }
    >
      <MachineGroup title="MÁY GIẶT" count={`${washers.length} MÁY`}>
        {washers.map(renderMachine)}
      </MachineGroup>
      <MachineGroup title="MÁY SẤY" count={`${dryers.length} MÁY`}>
        {dryers.map(renderMachine)}
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
  children: ReactNode
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
  validDrop = false,
  onDragOver,
  onDrop,
  canDrop = true,
  activeTask,
  onDragStart,
  onDragEnd,
}: {
  title: string
  state: string
  tone: string
  tag?: string
  dropTarget: boolean
  validDrop?: boolean
  onDragOver: () => void
  onDrop: () => void
  canDrop?: boolean
  activeTask?: QueueTask | null
  onDragStart?: () => void
  onDragEnd?: () => void
}) {
  const handleOver = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault()
    event.dataTransfer.dropEffect = 'move'
    onDragOver()
  }
  return (
    <div
      className={`machine ${tone} ${activeTask?.stage_status === 'IN_PROGRESS' ? 'machine-running' : ''} ${validDrop ? 'machine-drop-available' : ''} ${dropTarget ? 'machine-drop-target' : ''}`}
      onDragOver={canDrop ? handleOver : undefined}
      onDragEnter={canDrop ? handleOver : undefined}
      onDrop={(event) => {
        event.preventDefault()
        if (canDrop) onDrop()
      }}
    >
      <div className="machine-visual">
        <MachineIcon tone={tone.split(' ')[0] ?? tone} />
        {activeTask?.stage_status === 'MACHINE_FINISHED' && (
          <div
            className="machine-bag"
            draggable
            title="Kéo túi về đơn hàng"
            onDragStart={(event) => {
              event.stopPropagation()
              event.dataTransfer.effectAllowed = 'move'
              event.dataTransfer.setData('text/plain', String(activeTask.batch_stage_id))
              onDragStart?.()
            }}
            onDragEnd={(event) => {
              event.stopPropagation()
              onDragEnd?.()
            }}
          >
            <LaundryBagIcon />
          </div>
        )}
      </div>
      <strong>{title}</strong>
      <b>{state}</b>
      {activeTask && (
        <small>
          {activeTask.customer} · #{activeTask.order_id}
        </small>
      )}
      {tag && !activeTask && <small>{tag}</small>}
    </div>
  )
}
