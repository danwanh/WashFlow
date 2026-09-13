import { useState } from 'react'
import { BrowserRouter } from 'react-router-dom'
import { AppShell } from './components/layout/AppShell'
import { CreateOrderModal, DetailModal, ScenarioModal } from './components/modals/ModalComponents'
import { initialTasks } from './data/mockTasks'
import { AppRoutes } from './app/routes'
import {
  completePacking,
  confirmClassification,
  sendReadyNotification,
  updateStage,
  type CreatedOrder,
} from './api'
import type { Task } from './types/task'

type Modal = 'create' | 'detail' | 'reschedule' | 'delay' | 'notify' | null

function App() {
  const [selected, setSelected] = useState<Task | null>(null)
  const [modal, setModal] = useState<Modal>(null)
  const [toast, setToast] = useState(false)
  const [queueRefresh, setQueueRefresh] = useState(0)
  const showToast = () => {
    setToast(true)
    window.setTimeout(() => setToast(false), 3500)
  }
  const openDetail = (task: Task) => {
    setSelected(task)
    setModal('detail')
  }
  const addOrder = (order: CreatedOrder) => {
    setQueueRefresh((value) => value + 1)
    setModal(null)
    showToast()
  }
  const confirmScenario = () => {
    setModal(null)
    showToast()
  }
  const processDetailAction = async () => {
    if (!selected) return
    try {
      if (selected.batchId && selected.batchStageId) {
        const action =
          selected.stageStatus === 'PLANNED'
            ? 'start'
            : selected.stageStatus === 'IN_PROGRESS'
              ? 'machine-finished'
              : 'unload'
        await updateStage(selected, action, selected.machineId ?? undefined)
      } else if (selected.orderId) {
        if (selected.action === 'PHÂN LOẠI') await confirmClassification(selected.orderId)
        else if (selected.action === 'XẾP ĐỒ') await completePacking(selected.orderId)
        else
          await sendReadyNotification(
            selected.orderId,
            'Đơn hàng của bạn đã hoàn tất và sẵn sàng giao trả.',
          )
      }
      setModal(null)
      setQueueRefresh((value) => value + 1)
      showToast()
    } catch {
      setModal(null)
      showToast()
    }
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
          onCreate={() => setModal('create')}
          onDetail={openDetail}
          onScenario={(type) => setModal(type)}
          onToast={showToast}
          refreshToken={queueRefresh}
        />
      </AppShell>
      {modal === 'detail' && selected && (
        <DetailModal
          task={selected}
          onClose={() => setModal(null)}
          onAction={() => void processDetailAction()}
          onPickupChanged={() => {
            setQueueRefresh((value) => value + 1)
            showToast()
          }}
        />
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
