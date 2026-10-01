import { Plus } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { MachinePane, TaskCard } from '../components/queue/QueueComponents'
import { ConfirmActionModal, NotificationModal } from '../components/modals/ModalComponents'
import { getQueue, sendReadyNotification, updateStage, type QueueResponse } from '../api'
import type { Task } from '../types/task'

export function QueuePage({
  onCreate,
  onDetail,
  onScenario,
  onToast,
  refreshToken,
}: {
  onCreate: () => void
  onDetail: (task: Task) => void
  onScenario: (type: 'reschedule' | 'delay') => void
  onToast: () => void
  refreshToken: number
}) {
  const [filter, setFilter] = useState('all')
  const [dragging, setDragging] = useState<Task | null>(null)
  const [target, setTarget] = useState<string | null>(null)
  const [queue, setQueue] = useState<QueueResponse | null>(null)
  const [error, setError] = useState('')
  const [confirming, setConfirming] = useState<Task | null>(null)
  const [notifying, setNotifying] = useState<Task | null>(null)
  const [now, setNow] = useState(() => Date.now())
  const [machineWidth, setMachineWidth] = useState(20)
  const [resizing, setResizing] = useState(false)
  const resizeHandle = useRef<HTMLDivElement>(null)
  const load = () =>
    getQueue()
      .then((result) => {
        setError('')
        return result
      })
      .then(setQueue)
      .catch((cause) => setError(cause instanceof Error ? cause.message : 'Không thể tải hàng đợi'))
  useEffect(() => {
    void load()
    const timer = window.setInterval(() => void load(), 5_000)
    return () => window.clearInterval(timer)
  }, [refreshToken])
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [])
  const tasks: Task[] = (queue?.tasks ?? []).map((task) => ({
    id: String(task.order_id),
    rank: task.rank,
    action: task.action,
    actionType: task.action_type,
    customer: task.customer,
    group: task.group,
    detail: task.detail,
    due: new Date(task.due).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }),
    tone:
      task.action_type === 'NOTIFY'
        ? 'green'
        : task.action_type === 'PACK'
          ? 'amber'
          : task.stage_status === 'MACHINE_FINISHED'
            ? 'amber'
            : task.stage_status === 'IN_PROGRESS'
              ? 'blue'
              : 'slate',
    button: task.button ?? undefined,
    orderId: task.order_id,
    batchId: task.batch_id,
    batchStageId: task.batch_stage_id,
    stageStatus: task.stage_status,
    machineId: task.machine_id,
    machineType: task.machine_type,
    slackMinutes: task.slack_minutes,
    weightKg: task.weight_kg,
    estimatedAt: task.estimated_at,
    dueAt: task.due,
    plannedStartAt: task.planned_start_at,
    plannedEndAt: task.planned_end_at,
    actualStartedAt: task.actual_started_at,
    actualMachineFinishedAt: task.actual_machine_finished_at,
    actualEndedAt: task.actual_ended_at,
    timingStatus: task.timing_status,
    delayMinutes: task.delay_minutes,
    remainingMinutes: task.remaining_minutes,
    timingLabel: task.timing_label,
  }))
  const visible = tasks.filter(
    (task) =>
      filter === 'all' ||
      (filter === 'processing' && task.action.includes('MÁY')) ||
      (filter === 'ready' && task.action.includes('LẤY ĐỒ')) ||
      (filter === 'pending' &&
        (task.action.includes('PHÂN LOẠI') || task.action.includes('XẾP ĐỒ'))),
  )
  const complete = async (task: Task, notificationContent?: string) => {
    try {
      if (task.batchId && task.batchStageId) {
        const action = task.stageStatus === 'MACHINE_FINISHED' ? 'unload' : 'machine-finished'
        await updateStage(task, action)
      } else if (task.orderId) {
        await sendReadyNotification(task.orderId, notificationContent ?? '')
      }
      await load()
      onToast()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Không thể cập nhật tác vụ')
    }
  }
  const requestComplete = (task: Task) => {
    if (task.action === 'CHỜ GỬI TIN KHÁCH') setNotifying(task)
    else setConfirming(task)
  }
  const confirmComplete = async () => {
    if (!confirming) return
    const task = confirming
    setConfirming(null)
    await complete(task)
  }
  const canDropOn = (machineName: string) => {
    if (!dragging || dragging.stageStatus !== 'PLANNED') return false
    if (dragging.plannedStartAt && new Date(dragging.plannedStartAt).getTime() > now) return false
    const machine = queue?.machines.find((item) => item.name === machineName)
    return Boolean(
      machine &&
      machine.status === 'AVAILABLE' &&
      machine.type === dragging.machineType &&
      (dragging.weightKg ?? Number.POSITIVE_INFINITY) <= machine.capacity_kg,
    )
  }
  const updateMachineWidth = (clientX: number) => {
    const workspace = resizeHandle.current?.parentElement
    if (!workspace) return
    const bounds = workspace.getBoundingClientRect()
    const nextWidth = ((bounds.right - clientX) / bounds.width) * 100
    setMachineWidth(Math.min(42, Math.max(18, nextWidth)))
  }
  return (
    <>
      <section
        className="queue-pane"
        style={{
          width: `calc(100% - ${machineWidth}% - 8px)`,
          flexBasis: `calc(100% - ${machineWidth}% - 8px)`,
        }}
      >
        <div className="queue-header">
          <div>
            <div className="title-row">
              <h1>HÀNG ĐỢI CÔNG VIỆC</h1>
              <button className="primary small" onClick={onCreate}>
                <Plus size={17} /> Tạo đơn
              </button>
            </div>
            <p>Xếp theo thứ tự ưu tiên tự động · TIME → RESULT → ACTION · Bấm để xem chi tiết</p>
          </div>
          <div className="queue-tools">
            <label className="status-filter">
              Trạng thái
              <select value={filter} onChange={(event) => setFilter(event.target.value)}>
                <option value="all">Tất cả trạng thái</option>
                <option value="processing">Đang xử lý</option>
                <option value="ready">Sẵn sàng lấy</option>
                <option value="pending">Chờ xử lý</option>
              </select>
            </label>
            <button className="primary small queue-create-button" onClick={onCreate}>
              <Plus size={17} /> Tạo đơn
            </button>
            <div className="count-chip">
              <b>{tasks.length}</b> việc cần
              <br />
              xử lý
            </div>
          </div>
        </div>
        <div className="task-list">
          {visible.map((task) => (
            <TaskCard
              key={`${task.id}-${task.rank}`}
              task={task}
              onClick={() => onDetail(task)}
              now={now}
              onComplete={() => requestComplete(task)}
              onDragStart={() => setDragging(task)}
              onDragEnd={() => {
                setDragging(null)
                setTarget(null)
              }}
              canAcceptUnload={Boolean(
                dragging?.stageStatus === 'MACHINE_FINISHED' &&
                dragging.orderId === task.orderId &&
                dragging.batchStageId === task.batchStageId,
              )}
              onUnloadDrop={() => {
                if (!dragging) return
                const unloadTask = dragging
                setDragging(null)
                setTarget(null)
                requestComplete(unloadTask)
              }}
              onReschedule={async () => {
                if (task.batchId && task.batchStageId && task.stageStatus === 'PLANNED') {
                  try {
                    await updateStage(task, 'start', task.machineId ?? undefined)
                    await load()
                    onToast()
                  } catch (cause) {
                    setError(cause instanceof Error ? cause.message : 'Không thể bắt đầu máy')
                  }
                } else onScenario('reschedule')
              }}
            />
          ))}
        </div>
        {error && <p className="queue-error">{error}</p>}
        {queue && visible.length === 0 && (
          <div className="queue-empty">Không có công việc phù hợp với bộ lọc.</div>
        )}
      </section>
      <div
        ref={resizeHandle}
        className={`workspace-resize-handle ${resizing ? 'resizing' : ''}`}
        role="separator"
        aria-label="Điều chỉnh độ rộng khu vực máy"
        aria-orientation="vertical"
        tabIndex={0}
        onPointerDown={(event) => {
          event.preventDefault()
          event.currentTarget.setPointerCapture(event.pointerId)
          setResizing(true)
        }}
        onPointerMove={(event) => {
          if (resizing) updateMachineWidth(event.clientX)
        }}
        onPointerUp={(event) => {
          event.currentTarget.releasePointerCapture(event.pointerId)
          setResizing(false)
        }}
        onKeyDown={(event) => {
          if (event.key === 'ArrowLeft') setMachineWidth((value) => Math.min(42, value + 2))
          if (event.key === 'ArrowRight') setMachineWidth((value) => Math.max(18, value - 2))
        }}
      />
      <MachinePane
        machines={queue?.machines ?? []}
        widthPercent={machineWidth}
        now={now}
        dropTarget={target}
        onDragOver={(machine) => {
          if (dragging && canDropOn(machine)) setTarget(machine)
        }}
        canDrop={canDropOn}
        onUnloadDragStart={(task) => {
          const queueTask = tasks.find((item) => item.batchStageId === task.batch_stage_id)
          if (queueTask) setDragging(queueTask)
        }}
        onUnloadDragEnd={() => {
          setDragging(null)
          setTarget(null)
        }}
        onDrop={() => {
          if (!dragging) return
          if (!canDropOn(target ?? '')) {
            setError('Chỉ được chọn máy đúng loại, đủ công suất và đang trống')
            return
          }
          setDragging(null)
          setTarget(null)
          if (dragging.batchId && dragging.batchStageId) {
            const machine = queue?.machines.find((item) => item.name === target)
            void updateStage(dragging, 'start', machine?.machine_id)
              .then(load)
              .then(onToast)
              .catch((cause) =>
                setError(cause instanceof Error ? cause.message : 'Không thể đưa đồ vào máy'),
              )
          }
        }}
      />
      {confirming && (
        <ConfirmActionModal
          title="Xác nhận hoàn tất tác vụ"
          message={`${confirming.action} · Đơn #${confirming.id}. Xác nhận nhân viên đã hoàn tất bước này.`}
          action="Xác nhận xong"
          onClose={() => setConfirming(null)}
          onConfirm={() => void confirmComplete()}
        />
      )}
      {notifying && (
        <NotificationModal
          orderId={notifying.orderId!}
          customer={notifying.customer}
          onClose={() => setNotifying(null)}
          onSend={(content) => {
            const task = notifying
            setNotifying(null)
            void complete(task, content)
          }}
        />
      )}
    </>
  )
}
