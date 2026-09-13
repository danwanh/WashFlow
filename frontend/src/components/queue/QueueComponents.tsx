import { Check, Clock, MessageCircle } from 'lucide-react'
import type { DragEvent, ReactNode } from 'react'
import type { QueueTask } from '../../api'
import type { Task } from '../../types/task'

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

export function TaskCard({
  task,
  now,
  onClick,
  onComplete,
  onDragStart,
  onDragEnd,
  onReschedule,
}: {
  task: Task
  now: number
  onClick: () => void
  onComplete: () => void
  onDragStart: () => void
  onDragEnd: () => void
  onReschedule: () => void
}) {
  const canDrag =
    task.stageStatus === 'PLANNED' &&
    task.action.includes('VÀO MÁY') &&
    (!task.plannedStartAt || new Date(task.plannedStartAt).getTime() <= now)
  const deadline = task.estimatedAt ? new Date(task.estimatedAt).getTime() : 0
  const due = task.dueAt ? new Date(task.dueAt).getTime() : 0
  const stageEnd = task.plannedEndAt ? new Date(task.plannedEndAt).getTime() : 0
  const remaining =
    task.stageStatus === 'IN_PROGRESS' && stageEnd ? Math.ceil((stageEnd - now) / 60000) : null
  const timeLabel =
    task.stageStatus === 'PLANNED' && task.plannedStartAt
      ? `Đợi ${Math.max(0, Math.ceil((new Date(task.plannedStartAt).getTime() - now) / 60000))} phút`
      : task.stageStatus === 'IN_PROGRESS'
        ? remaining !== null && remaining < 0
          ? `Trễ ${Math.abs(remaining)} phút`
          : `Còn ${Math.max(0, remaining ?? 0)} phút`
        : task.stageStatus === 'MACHINE_FINISHED'
          ? 'Chờ dỡ đồ'
          : deadline && due && deadline > due
            ? `Trễ ${Math.ceil((deadline - due) / 60000)} phút`
            : 'Đúng hẹn'
  return (
    <article className={`task-card ${task.rank === 1 ? 'selected' : ''}`} onClick={onClick}>
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
        <div className={`task-timing ${timeLabel.startsWith('Trễ') ? 'late' : ''}`}>
          <Clock size={13} /> {timeLabel}
        </div>
      </div>
      <div className="task-action">
        {task.button &&
          (['✓  Xong', 'Xong', 'Máy xong', 'Gửi tin khách'].includes(task.button) ? (
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
        {canDrag && <small className="drag-hint">Kéo túi vào máy phù hợp</small>}
      </div>
    </article>
  )
}

export function Upcoming({ time, id }: { time: string; id: string }) {
  return (
    <div className="upcoming-row">
      <b>{time}</b>
      <strong>PHÂN LOẠI</strong>
      <span>{id}</span>
      <em>Chờ đồ đến</em>
    </div>
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
  const renderMachine = (machine: (typeof machines)[number]) => (
    <Machine
      key={machine.machine_id}
      title={machine.name}
      state={
        machine.active_task?.stage_status === 'MACHINE_FINISHED'
          ? 'Chờ dỡ đồ'
          : machine.active_task?.planned_end_at
            ? `Còn ${Math.max(0, Math.ceil((new Date(machine.active_task.planned_end_at).getTime() - now) / 60000))} phút`
            : machineState(machine.status)
      }
      tone={machine.status === 'AVAILABLE' ? 'empty' : machine.status === 'BUSY' ? 'blue' : 'amber'}
      dropTarget={dropTarget === machine.name}
      onDragOver={() => onDragOver(machine.name)}
      canDrop={canDrop(machine.name)}
      activeTask={machine.active_task}
      draggable={machine.active_task?.stage_status === 'MACHINE_FINISHED'}
      onDragStart={() => machine.active_task && onUnloadDragStart(machine.active_task)}
      onDragEnd={onUnloadDragEnd}
      onDrop={() => onDrop(machine.name)}
    />
  )
  return (
    <aside className="machines-pane">
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
  onDragOver,
  onDrop,
  canDrop = true,
  activeTask,
  draggable = false,
  onDragStart,
  onDragEnd,
}: {
  title: string
  state: string
  tone: string
  tag?: string
  dropTarget: boolean
  onDragOver: () => void
  onDrop: () => void
  canDrop?: boolean
  activeTask?: QueueTask | null
  draggable?: boolean
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
      className={`machine ${tone} ${activeTask?.stage_status === 'IN_PROGRESS' ? 'machine-running' : ''} ${dropTarget ? 'machine-drop-target' : ''}`}
      onDragOver={canDrop ? handleOver : undefined}
      onDragEnter={canDrop ? handleOver : undefined}
      onDrop={(event) => {
        event.preventDefault()
        if (canDrop) onDrop()
      }}
      draggable={draggable}
      onDragStart={(event) => {
        if (!draggable) return
        event.stopPropagation()
        event.dataTransfer.effectAllowed = 'move'
        onDragStart?.()
      }}
      onDragEnd={onDragEnd}
    >
      <MachineIcon tone={tone} />
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

export function OrderSummary() {
  return (
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
  )
}
