import { useState } from 'react'
import { BrowserRouter } from 'react-router-dom'
import { AppShell } from './components/layout/AppShell'
import { CreateOrderModal, DetailModal, ScenarioModal } from './components/modals/ModalComponents'
import { AppRoutes } from './app/routes'
import { sendReadyNotification, updateStage, type CreatedOrder } from './api'
import type { Task } from './types/task'
import type { Alert } from './api'

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
      } else if (selected.orderId && selected.action === 'CHỜ GỬI TIN KHÁCH') {
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
  const handleAlertAction = (alert: Alert) => {
    openDetail({
      id: String(alert.order_id),
      rank: 0,
      action:
        alert.type === 'FORGOTTEN_PACKING'
          ? 'XẾP ĐỒ'
          : alert.type === 'FORGOTTEN_NOTIFICATION'
            ? 'CHỜ GỬI TIN KHÁCH'
            : 'LẤY ĐỒ RA',
      customer: `Đơn #${alert.order_id}`,
      group: alert.batch_id ? `Mẻ #${alert.batch_id}` : 'Cảnh báo vận hành',
      detail: alert.reason,
      due: '',
      tone: alert.severity === 'CRITICAL' ? 'amber' : 'amber',
      orderId: alert.order_id,
      batchId: alert.batch_id ?? undefined,
    })
  }
  return (
    <BrowserRouter>
      <AppShell
        toast={toast}
        onCreate={() => setModal('create')}
        onScenario={(type) => setModal(type)}
        onCloseToast={() => setToast(false)}
        onAlertAction={handleAlertAction}
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
