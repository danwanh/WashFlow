import { initialTasks } from '../data/mockTasks'
import { ViewHeader } from '../components/overview/OverviewComponents'
import { Card } from '../components/machines/MachineComponents'
import type { Task } from '../types/task'
import { useNavigate } from 'react-router-dom'

export function MachinesPage({ onOpen }: { onOpen: (task: Task) => void }) {
  const navigate = useNavigate()
  return (
    <section className="view-panel">
      <ViewHeader
        title="Giám sát thiết bị máy"
        subtitle="Cảm biến IoT lồng xoay, nhiệt độ sấy và thời gian chu trình theo máy"
        action="← Về Hàng đợi"
        onAction={() => navigate('/queue')}
      />
      <div className="machine-board">
        <Card
          name="Máy giặt 01"
          capacity="Lồng ngang 10kg"
          state="Đang giặt"
          tone="blue"
          detail="#123 · Đồ màu"
          time="Còn 16 phút"
        />
        <Card
          name="Máy giặt 02"
          capacity="Lồng ngang 9kg"
          state="Đã xong · Chờ lấy"
          tone="green"
          detail="#123 · Đồ trắng"
          action="Lấy đồ ra"
          onAction={() => onOpen(initialTasks[0])}
        />
        <Card
          name="Máy giặt 03"
          capacity="Lồng ngang 12kg"
          state="Đang trống"
          tone="empty"
          detail="Sẵn sàng nhận đồ"
          time="0p"
        />
        <Card
          name="Máy sấy 01"
          capacity="Sấy hơi 10kg"
          state="Đang trống"
          tone="empty"
          detail="Sẵn sàng nhận đồ"
          time="0p"
        />
        <Card
          name="Máy sấy 02"
          capacity="Sấy nhiệt 12kg"
          state="Đang sấy"
          tone="amber"
          detail="#123 · Đồ trắng"
          time="Còn 8 phút"
        />
      </div>
    </section>
  )
}
