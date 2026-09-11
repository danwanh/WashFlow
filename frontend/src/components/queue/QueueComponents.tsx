import { Check, MessageCircle } from 'lucide-react'
import type { DragEvent, ReactNode } from 'react'
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
}: {
  title: string
  state: string
  tone: string
  tag?: string
  dropTarget: boolean
  onDragOver: () => void
  onDrop: () => void
}) {
  const handleOver = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault()
    event.dataTransfer.dropEffect = 'move'
    onDragOver()
  }
  return (
    <div
      className={`machine ${tone} ${dropTarget ? 'machine-drop-target' : ''}`}
      onDragOver={handleOver}
      onDragEnter={handleOver}
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
