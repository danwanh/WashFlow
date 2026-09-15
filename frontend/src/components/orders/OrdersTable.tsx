import type { OrderSummary } from '../../api'

const statusLabels: Record<string, string> = {
  RECEIVED: 'Mới tiếp nhận',
  WAITING: 'Đang xử lý',
  FOLDING_PACKING: 'Đang xếp đồ',
  READY: 'Sẵn sàng lấy',
  COMPLETED: 'Đã hoàn tất',
}

export function OrdersTable({ orders, onOpen }: { orders: OrderSummary[]; onOpen: (order: OrderSummary) => void }) {
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
          {orders.map((order) => (
            <tr key={order.order_id}>
              <td className="code">#{order.order_id}</td>
              <td className="strong">{order.customer.name}</td>
              <td>
                <span className="table-pill">{order.service_type.replace('_', ' + ')}</span>
              </td>
              <td className="code">{new Date(order.pickup_at).toLocaleString('vi-VN', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' })}</td>
              <td>
                <span className={`status ${order.status === 'READY' ? 'green' : order.status === 'COMPLETED' ? 'slate' : 'blue'}`}>{statusLabels[order.status] ?? order.status}</span>
              </td>
              <td>
                <button className="table-action" onClick={() => onOpen(order)}>
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
