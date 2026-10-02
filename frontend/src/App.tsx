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
import { useLiveUpdates } from './hooks/useLiveUpdates'
import { useStatusFeed } from './hooks/useStatusFeed'
import type { Task } from './types/task'
import type { Alert } from './api'

type Modal = 'create' | 'detail' | null

function App() {
  const [selected, setSelected] = useState<Task | null>(null)
  const [modal, setModal] = useState<Modal>(null)
  const feed = useStatusFeed()
  useLiveUpdates()
  // After any change: refetch the shared queue; the feed reports what actually changed.
  const afterChange = () => {
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
        'Your order is complete and ready for pickup.',
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
          ? 'PACK'
          : alert.type === 'FORGOTTEN_NOTIFICATION'
            ? 'NOTIFY CUSTOMER'
            : 'UNLOAD',
      customer: `Order #${alert.order_id}`,
      group: alert.batch_id ? `Batch #${alert.batch_id}` : 'Operations alert',
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
              title: `Order #${orderId}: pickup time changed`,
              detail: `New pickup time ${new Date(pickupAt).toLocaleString('en-GB', {
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
