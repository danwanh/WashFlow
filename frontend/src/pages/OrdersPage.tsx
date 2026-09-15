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
  const [orders, setOrders] = useState<OrderSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const load = () => {
    setLoading(true)
    void getOrders().then((result) => { setOrders(result); setError('') }).catch((cause) => setError(cause instanceof Error ? cause.message : 'Không thể tải đơn hàng')).finally(() => setLoading(false))
  }
  useEffect(() => { load() }, [])
  const openOrder = (order: OrderSummary) => onOpen({ id: String(order.order_id), rank: 0, action: 'XEM CHI TIẾT', customer: order.customer.name, group: order.service_type, detail: `${order.total_weight_kg}kg`, due: new Date(order.pickup_at).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }), tone: 'slate', orderId: order.order_id })
  return (
    <section className="view-panel">
      <ViewHeader
        title="Danh sách đơn hàng hôm nay"
        subtitle="Toàn bộ đơn hàng ca trực · Bấm xem chi tiết để theo dõi luồng đồ"
        action="+ Tạo đơn mới"
        onAction={onCreate}
        primary
      />
       {loading && <p className="data-state">Đang tải đơn hàng...</p>}
       {error && <p className="queue-error">{error} <button className="table-action" onClick={load}>Thử lại</button></p>}
       {!loading && !error && orders.length === 0 && <p className="data-state">Chưa có đơn hàng trong hệ thống.</p>}
       {!loading && !error && orders.length > 0 && <OrdersTable orders={orders} onOpen={openOrder} />}
    </section>
  )
}
import { useEffect, useState } from 'react'
import { getOrders, type OrderSummary } from '../api'
