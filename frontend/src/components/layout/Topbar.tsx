import { BarChart3, FileText, ListFilter, WashingMachine } from 'lucide-react'
import { NavLink } from 'react-router-dom'

type TopbarProps = {
  onCreate: () => void
  onScenario: (type: 'delay' | 'notify') => void
}

export function Topbar({ onCreate, onScenario }: TopbarProps) {
  const links = [
    {
      to: '/queue',
      label: 'Hàng đợi',
      icon: <ListFilter size={14} />,
      count: taskCount === null ? undefined : String(taskCount),
    },
    { to: '/overview', label: 'Tổng quan', icon: <BarChart3 size={14} /> },
    { to: '/orders', label: 'Đơn hàng', icon: <FileText size={14} /> },
    { to: '/machines', label: 'Máy', icon: <WashingMachine size={14} /> },
  ]

  return (
    <header className="topbar">
      <div className="brand-area">
        <div className="brand-mark">
          <WashingMachine size={21} />
        </div>
        <div className="brand-copy">
          <strong>WashTrack</strong>
        </div>
        <nav className="main-nav">
          {links.map((link) => (
            <NavLink
              key={link.to}
              to={link.to}
              className={({ isActive }) => `nav-button ${isActive ? 'active' : ''}`}
            >
              {link.icon}
              <span>{link.label}</span>
              {link.count && <b>{link.count}</b>}
            </NavLink>
          ))}
        </nav>
      </div>
      <div className="scenario-bar">
        <small>KỊCH BẢN:</small>
        <button onClick={onCreate}>
          + Tạo đơn
          <br />
          (Chia nhóm)
        </button>
        <button className="amber-action" onClick={() => onScenario('delay')}>
          ⚡ Demo 1<br />
          nhóm xong
        </button>
        <button className="green-action" onClick={() => onScenario('notify')}>
          ✓ Đơn xong
          <br />
          hết → Gửi tin
        </button>
        <button className="red-action" onClick={() => onScenario('delay')}>
          ⚠ Cảnh
          <br />
          báo trễ
        </button>
      </div>
    </header>
  )
}
