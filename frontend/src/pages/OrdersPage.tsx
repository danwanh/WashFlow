import { ViewHeader } from '../components/overview/OverviewComponents'
import { OrdersTable } from '../components/orders/OrdersTable'
import type { Task } from '../types/task'

export function OrdersPage({
  onCreate,
  onOpen,
}: {
  onCreate: () => void
  onOpen: (task: Task) => void
}) {
  return (
    <section className="view-panel">
      <ViewHeader
        title="Danh sách đơn hàng hôm nay"
        subtitle="Toàn bộ đơn hàng ca trực · Bấm xem chi tiết để theo dõi luồng đồ"
        action="+ Tạo đơn mới"
        onAction={onCreate}
        primary
      />
      <OrdersTable onOpen={onOpen} />
    </section>
  )
}
