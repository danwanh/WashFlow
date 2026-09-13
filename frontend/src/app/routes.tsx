import { Navigate, Route, Routes } from 'react-router-dom'
import { MachinesPage } from '../pages/MachinesPage'
import { OrdersPage } from '../pages/OrdersPage'
import { OverviewPage } from '../pages/OverviewPage'
import { QueuePage } from '../pages/QueuePage'
import type { Task } from '../types/task'

export function AppRoutes({
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
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/queue" replace />} />
      <Route
        path="/queue"
        element={
          <QueuePage
            onCreate={onCreate}
            onDetail={onDetail}
            onScenario={onScenario}
            onToast={onToast}
            refreshToken={refreshToken}
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
