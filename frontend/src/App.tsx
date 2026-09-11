import { useState } from 'react'
import { BrowserRouter } from 'react-router-dom'
import { AppShell } from './components/layout/AppShell'
import { CreateOrderModal, DetailModal, ScenarioModal } from './components/modals/ModalComponents'
import { initialTasks } from './data/mockTasks'
import { AppRoutes } from './app/routes'
import type { CreatedOrder } from './api'
import type { Task } from './types/task'

type Modal = 'create' | 'detail' | 'reschedule' | 'delay' | 'notify' | null

function App() {
  const [tasks, setTasks] = useState(initialTasks)
  const [selected, setSelected] = useState<Task | null>(null)
  const [modal, setModal] = useState<Modal>(null)
  const [toast, setToast] = useState(false)
  const showToast = () => {
    setToast(true)
    window.setTimeout(() => setToast(false), 3500)
  }
  const openDetail = (task: Task) => {
    setSelected(task)
    setModal('detail')
  }
  const addOrder = (order: CreatedOrder) => {
    setTasks((current) => [
      {
        id: String(order.order_id),
        rank: 1,
        action: 'PHÂN LOẠI',
        customer: order.customer.name,
        group: `${order.batches.length} nhóm xử lý`,
        detail: `${order.total_weight_kg.toFixed(1)}kg · Đơn mới nhận`,
        due: new Date(order.pickup_at).toLocaleTimeString('vi-VN', {
          hour: '2-digit',
          minute: '2-digit',
        }),
        tone: 'slate',
        button: '✓  Xong',
      },
      ...current.map((task, index) => ({ ...task, rank: index + 2 })),
    ])
    setModal(null)
    showToast()
  }
  const confirmScenario = () => {
    setModal(null)
    showToast()
  }
  return (
    <BrowserRouter>
      <AppShell
        toast={toast}
        onCreate={() => setModal('create')}
        onOrder={() => openDetail(initialTasks[0])}
        onScenario={(type) => setModal(type)}
        onCloseToast={() => setToast(false)}
      >
        <AppRoutes
          tasks={tasks}
          onTasks={setTasks}
          onCreate={() => setModal('create')}
          onDetail={openDetail}
          onScenario={(type) => setModal(type)}
          onToast={showToast}
        />
      </AppShell>
      {modal === 'detail' && selected && (
        <DetailModal task={selected} onClose={() => setModal(null)} />
      )}
      {modal === 'create' && (
        <CreateOrderModal onClose={() => setModal(null)} onCreate={addOrder} />
      )}
      {(modal === 'reschedule' || modal === 'delay' || modal === 'notify') && (
        <ScenarioModal type={modal} onClose={() => setModal(null)} onConfirm={confirmScenario} />
      )}
    </BrowserRouter>
  )
}

export default App
