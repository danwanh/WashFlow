import { AlertTriangle, CheckCircle2, Info, X } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { Topbar } from './Topbar'
import { AlertBell } from '../alerts/AlertBell'
import type { Alert } from '../alerts/AlertBell'
import type { Notice } from '../../utils/statusDiff'

type AppShellProps = {
  children: ReactNode
  notices: Notice[]
  taskCount: number | null
  onCreate: () => void
  onScenario: (type: 'delay' | 'notify') => void
  onCloseToast: () => void
  onAlertAction: (alert: Alert) => void
}

const noticeIcon = (tone: Notice['tone']) =>
  tone === 'success' ? (
    <CheckCircle2 size={26} fill="currentColor" />
  ) : tone === 'warning' ? (
    <AlertTriangle size={26} />
  ) : (
    <Info size={26} />
  )

export function AppShell({
  children,
  notices,
  taskCount,
  onCreate,
  onScenario,
  onCloseToast,
  onAlertAction,
}: AppShellProps) {
  const [alertDismissSignal, setAlertDismissSignal] = useState(0)
  return (
    <div className="app-shell">
      <Topbar onCreate={onCreate} onScenario={onScenario} />
      <main className="workspace">{children}</main>
      <AlertBell onAction={onAlertAction} dismissSignal={alertDismissSignal} />
      {import.meta.env.DEV && (
        <button
          className="dev-dismiss-all"
          title="Chỉ có khi chạy dev: đóng mọi thông báo và popup cảnh báo đang chờ"
          onClick={() => {
            onDismissAllNotices()
            setAlertDismissSignal((value) => value + 1)
          }}
        >
          <X size={14} /> Đóng tất cả thông báo
        </button>
      )}
      {notices.length > 0 && (
        <div className="toast-stack" role="status" aria-live="polite">
          {notices.map((notice) => (
            <div className={`toast ${notice.tone}`} key={notice.id}>
              {noticeIcon(notice.tone)}
              <div>
                <b>{notice.title}</b>
                <span>{notice.detail}</span>
              </div>
              <button onClick={() => onDismissNotice(notice.id)} aria-label="Đóng thông báo">
                <X size={17} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
