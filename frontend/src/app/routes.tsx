import { Navigate, Route, Routes } from 'react-router-dom'
import { MachinesPage } from '../pages/MachinesPage'
import { OrdersPage } from '../pages/OrdersPage'
import { OverviewPage } from '../pages/OverviewPage'
import { QueuePage } from '../pages/QueuePage'
import type { Task } from '../types/task'

export function AppRoutes({
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
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/queue" replace />} />
      <Route
        path="/queue"
        element={
          <QueuePage
            tasks={tasks}
            onTasks={onTasks}
            onCreate={onCreate}
            onDetail={onDetail}
            onScenario={onScenario}
            onToast={onToast}
          />
        }
      />
      <Route path="/overview" element={<OverviewPage />} />
      <Route path="/orders" element={<OrdersPage onCreate={onCreate} onOpen={onDetail} />} />
      <Route path="/machines" element={<MachinesPage onOpen={onDetail} />} />
      <Route path="*" element={<Navigate to="/queue" replace />} />
    </Routes>
  )
}
