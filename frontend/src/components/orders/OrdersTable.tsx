import { initialTasks } from '../../data/mockTasks'
import type { Task } from '../../types/task'

export function OrdersTable({ onOpen }: { onOpen: (task: Task) => void }) {
  return (
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
  )
}
