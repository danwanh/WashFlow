import { Plus } from 'lucide-react'
import { useState } from 'react'
import { MachinePane, OrderSummary, TaskCard, Upcoming } from '../components/queue/QueueComponents'
import { initialTasks } from '../data/mockTasks'
import type { Task } from '../types/task'

export function QueuePage({
  tasks,
  onTasks,
  onCreate,
  onDetail,
  onScenario,
  onToast,
}: {
  tasks: Task[]
  onTasks: (tasks: Task[]) => void
  onCreate: () => void
  onDetail: (task: Task) => void
  onScenario: (type: 'reschedule' | 'delay') => void
  onToast: () => void
}) {
  const [filter, setFilter] = useState('all')
  const [dragging, setDragging] = useState<Task | null>(null)
  const [target, setTarget] = useState<string | null>(null)
  const visible = tasks.filter(
    (task) =>
      filter === 'all' ||
      (filter === 'processing' && task.action.includes('MÁY')) ||
      (filter === 'ready' && task.action.includes('LẤY ĐỒ')) ||
      (filter === 'pending' &&
        (task.action.includes('PHÂN LOẠI') || task.action.includes('XẾP ĐỒ'))),
  )
  const complete = (task: Task) => {
    onTasks(tasks.filter((item) => item !== task))
    onToast()
  }
  return (
    <>
      <section className="queue-pane">
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
              onComplete={() => complete(task)}
              onDragStart={() => setDragging(task)}
              onDragEnd={() => {
                setDragging(null)
                setTarget(null)
              }}
              onReschedule={() => onScenario('reschedule')}
            />
          ))}
        </div>
        <OrderSummary />
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
        dropTarget={target}
        onDragOver={(machine) => {
          if (dragging) setTarget(machine)
        }}
        onDrop={() => {
          if (!dragging) return
          setDragging(null)
          setTarget(null)
          onToast()
        }}
      />
    </>
  )
}

export { initialTasks }
