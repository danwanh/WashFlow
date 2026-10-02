import type { OrderSummary } from '../../api'

const statusLabels: Record<string, string> = {
  RECEIVED: 'Received',
  WAITING: 'Processing',
  FOLDING_PACKING: 'Packing',
  READY: 'Ready for pickup',
  COMPLETED: 'Completed',
}

export function OrdersTable({ orders, onOpen }: { orders: OrderSummary[]; onOpen: (order: OrderSummary) => void }) {
  return (
    <div className="orders-table">
      <table>
        <thead>
          <tr>
            <th>Order</th>
            <th>Customer</th>
            <th>Service</th>
            <th>Pickup</th>
            <th>Status</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {orders.map((order) => (
            <tr key={order.order_id} className="order-row" onClick={() => onOpen(order)}>
              <td className="code">#{order.order_id}</td>
              <td className="strong">{order.customer.name}</td>
              <td>
                <span className="table-pill">{order.service_type.replace('_', ' + ')}</span>
              </td>
              <td className="code">{new Date(order.pickup_at).toLocaleString('en-GB', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' })}</td>
              <td>
                <span className={`status ${order.status === 'READY' ? 'green' : order.status === 'COMPLETED' ? 'slate' : 'blue'}`}>{statusLabels[order.status] ?? order.status}</span>
              </td>
              <td>
                <button className="table-action" onClick={(event) => { event.stopPropagation(); onOpen(order) }}>
                  View details
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
