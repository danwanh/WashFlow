import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { getMachines, updateMachineStatus, type Machine } from '../api'
import { ViewHeader } from '../components/overview/OverviewComponents'
import { Card } from '../components/machines/MachineComponents'
import type { Task } from '../types/task'

const statusText: Record<Machine['status'], string> = {
  AVAILABLE: 'Đang trống',
  BUSY: 'Đang chạy',
  OFFLINE: 'Ngoại tuyến',
  MAINTENANCE: 'Đang bảo trì',
}

export function MachinesPage({ onOpen }: { onOpen: (task: Task) => void }) {
  const navigate = useNavigate()
  const [machines, setMachines] = useState<Machine[]>([])
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const load = () => {
    setLoading(true)
    void getMachines().then((result) => { setMachines(result); setError('') }).catch((cause) => setError(cause instanceof Error ? cause.message : 'Không thể tải máy')).finally(() => setLoading(false))
  }
  useEffect(() => { load() }, [])
  const changeStatus = async (machine: Machine, status: string) => {
    try {
      setError('')
      const updated = await updateMachineStatus(machine.machine_id, status as Machine['status'])
      setMachines((items) => items.map((item) => item.machine_id === updated.machine_id ? { ...item, ...updated } : item))
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Không thể cập nhật trạng thái máy')
    }
  }
  return (
    <section className="view-panel">
      <ViewHeader title="Giám sát thiết bị máy" subtitle="Trạng thái và lịch xử lý lấy trực tiếp từ hệ thống" action="← Về Hàng đợi" onAction={() => navigate('/queue')} />
      {loading && <p className="data-state">Đang tải danh sách máy...</p>}
      {error && <p className="queue-error">{error} <button className="table-action" onClick={load}>Thử lại</button></p>}
      {!loading && !error && machines.length === 0 && <p className="data-state">Chưa có máy trong hệ thống.</p>}
      <div className="machine-board">
        {machines.map((machine) => {
          const active = machine.active_stage
          const tone = machine.status === 'BUSY' ? (active?.status === 'MACHINE_FINISHED' ? 'green' : 'blue') : machine.status === 'AVAILABLE' ? 'empty' : 'amber'
          const task: Task = { id: String(active?.order_id ?? ''), rank: 0, action: 'XEM CHI TIẾT', customer: active?.customer ?? '', group: active?.stage ?? '', detail: '', due: '', tone: 'slate', orderId: active?.order_id ?? undefined }
          return <Card key={machine.machine_id} name={machine.name} capacity={`${machine.type === 'WASHER' ? 'Giặt' : 'Sấy'} · ${machine.capacity_kg}kg`} state={statusText[machine.status]} tone={tone} detail={active ? `#${active.order_id} · ${active.customer}` : 'Sẵn sàng nhận đồ'} time={active?.planned_end_at ? `Đến ${new Date(active.planned_end_at).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}` : '0 phút'} status={machine.status} onStatusChange={(status) => void changeStatus(machine, status)} action={active?.order_id ? 'Xem đơn' : undefined} onAction={() => onOpen(task)} />
        })}
      </div>
    </section>
  )
}
