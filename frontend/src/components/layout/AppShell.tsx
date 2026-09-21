import { CheckCircle2, X } from 'lucide-react'
import type { ReactNode } from 'react'
import { Topbar } from './Topbar'
import { AlertBell } from '../alerts/AlertBell'
import type { Alert } from '../alerts/AlertBell'

type AppShellProps = {
  children: ReactNode
  toast: boolean
  onCreate: () => void
  onOrder: () => void
  onScenario: (type: 'delay' | 'notify') => void
  onCloseToast: () => void
  onAlertAction: (alert: Alert) => void
}

export function AppShell({
  children,
  toast,
  onCreate,
  onOrder,
  onScenario,
  onCloseToast,
  onAlertAction,
}: AppShellProps) {
  return (
    <div className="app-shell">
      <Topbar onCreate={onCreate} onOrder={onOrder} onScenario={onScenario} />
      <main className="workspace">{children}</main>
      <AlertBell onAction={onAlertAction} />
      {toast && (
        <div className="toast">
          <CheckCircle2 size={30} fill="currentColor" />
          <div>
            <b>✓ Máy 02 đã xong</b>
            <span>#123 · LẤY ĐỒ RA</span>
          </div>
          <button onClick={onCloseToast}>
            <X size={17} />
          </button>
        </div>
      )}
    </div>
  )
}
