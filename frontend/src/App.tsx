import { useState } from 'react'
import { BrowserRouter } from 'react-router-dom'
import { AppShell } from './components/layout/AppShell'
import {
  CreateOrderModal,
  DetailModal,
  type DetailAction,
} from './components/modals/ModalComponents'
import { AppRoutes } from './app/routes'
import { sendReadyNotification, updateStage } from './api'
import { useStatusFeed } from './hooks/useStatusFeed'
import type { Task } from './types/task'
import type { Alert } from './api'

type Modal = 'create' | 'detail' | null

function App() {
  const [selected, setSelected] = useState<Task | null>(null)
  const [modal, setModal] = useState<Modal>(null)
  const [queueRefresh, setQueueRefresh] = useState(0)
  const feed = useStatusFeed()
  // After any change: reload the queue page and report what actually changed.
  const afterChange = () => {
    setQueueRefresh((value) => value + 1)
    void feed.refresh()
  }
  const openDetail = (task: Task) => {
    setSelected(task)
    setModal('detail')
  }
  // Errors propagate so the detail modal can show them and stay open.
  const processDetailAction = async (action: DetailAction) => {
    if (action.kind === 'stage')
      await updateStage(
        action,
        action.endpoint,
        action.endpoint === 'start' ? action.machineId : undefined,
      )
    else
      await sendReadyNotification(
        action.orderId,
        'Đơn hàng của bạn đã hoàn tất và sẵn sàng giao trả.',
      )
    setModal(null)
    afterChange()
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
      tone: 'amber',
      orderId: alert.order_id,
      batchId: alert.batch_id ?? undefined,
    })
  }
  return (
    <BrowserRouter>
      <AppShell
        notices={feed.notices}
        taskCount={feed.taskCount}
        onCreate={() => setModal('create')}
        onDismissNotice={feed.dismiss}
        onDismissAllNotices={feed.clearAll}
        onAlertAction={handleAlertAction}
      >
        <AppRoutes
          onCreate={() => setModal('create')}
          onDetail={openDetail}
          onChanged={afterChange}
          refreshToken={queueRefresh}
        />
      </AppShell>
      {modal === 'detail' && selected && (
        <DetailModal
          task={selected}
          onClose={() => setModal(null)}
          onAction={processDetailAction}
          onPickupChanged={(orderId, pickupAt) => {
            feed.push({
              tone: 'info',
              title: `Đơn #${orderId}: đã đổi giờ hẹn`,
              detail: `Giờ hẹn mới ${new Date(pickupAt).toLocaleString('vi-VN', {
                hour: '2-digit',
                minute: '2-digit',
                day: '2-digit',
                month: '2-digit',
              })}`,
            })
            afterChange()
          }}
        />
      )}
      {modal === 'create' && (
        <CreateOrderModal
          onClose={() => setModal(null)}
          onCreate={() => {
            setModal(null)
            afterChange()
          }}
        />
      )}
    </BrowserRouter>
  )
}

export default App
