import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  getMachines,
  previewMachineMaintenance,
  updateMachineStatus,
  type Machine,
  type MaintenancePreview,
} from '../api'
import { MaintenanceConfirmModal } from '../components/modals/ModalComponents'
import { ViewHeader } from '../components/overview/OverviewComponents'
import { Card } from '../components/machines/MachineComponents'
import type { Task } from '../types/task'

const statusText: Record<Machine['status'], string> = {
  AVAILABLE: 'Idle',
  BUSY: 'Running',
  MAINTENANCE: 'Under maintenance',
}

export function MachinesPage({ onOpen }: { onOpen: (task: Task) => void }) {
  const navigate = useNavigate()
  const [machines, setMachines] = useState<Machine[]>([])
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const load = () => {
    setLoading(true)
    void getMachines().then((result) => { setMachines(result); setError('') }).catch((cause) => setError(cause instanceof Error ? cause.message : 'Could not load machines')).finally(() => setLoading(false))
  }
  useEffect(() => { load() }, [])
  const [switching, setSwitching] = useState<number | null>(null)
  const [pending, setPending] = useState<{ machine: Machine; impact: MaintenancePreview } | null>(null)
  const failed = (cause: unknown) =>
    setError(cause instanceof Error ? cause.message : 'Could not update machine status')
  // Back to service is immediate; maintenance first shows what it would do to the schedule.
  const toggleMaintenance = async (machine: Machine) => {
    setError('')
    setSwitching(machine.machine_id)
    try {
      if (machine.status === 'MAINTENANCE') {
        await updateMachineStatus(machine.machine_id, 'AVAILABLE')
        load()
      } else {
        setPending({ machine, impact: await previewMachineMaintenance(machine.machine_id) })
      }
    } catch (cause) {
      failed(cause)
    } finally {
      setSwitching(null)
    }
  }
  const confirmMaintenance = async () => {
    if (!pending) return
    setSwitching(pending.machine.machine_id)
    try {
      await updateMachineStatus(pending.machine.machine_id, 'MAINTENANCE')
      setPending(null)
      load()
    } catch (cause) {
      setPending(null)
      failed(cause)
    } finally {
      setSwitching(null)
    }
  }
  return (
    <section className="view-panel">
      <ViewHeader title="Machine monitor" subtitle="Live status and schedule from the system" action="← Back to queue" onAction={() => navigate('/queue')} />
      {loading && <p className="data-state">Loading machines...</p>}
      {error && <p className="queue-error">{error} <button className="table-action" onClick={load}>Retry</button></p>}
      {!loading && !error && machines.length === 0 && <p className="data-state">No machines in the system yet.</p>}
      <div className="machine-board">
        {machines.map((machine) => {
          const active = machine.active_stage
          const tone = machine.status === 'BUSY' ? (active?.status === 'MACHINE_FINISHED' ? 'green' : 'blue') : machine.status === 'AVAILABLE' ? 'empty' : 'amber'
          const task: Task = { id: String(active?.order_id ?? ''), rank: 0, action: 'VIEW DETAILS', customer: active?.customer ?? '', group: active?.stage ?? '', detail: '', due: '', tone: 'slate', orderId: active?.order_id ?? undefined }
          return <Card key={machine.machine_id} name={machine.name} capacity={`${machine.type === 'WASHER' ? 'Wash' : 'Dry'} · ${machine.capacity_kg}kg`} state={statusText[machine.status]} tone={tone} detail={active ? `#${active.order_id} · ${active.customer}` : 'Ready for laundry'} time={active?.planned_end_at ? `Until ${new Date(active.planned_end_at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}` : '0 min'} maintenance={machine.status === 'MAINTENANCE'} switching={switching === machine.machine_id} onToggleMaintenance={() => void toggleMaintenance(machine)} action={active?.order_id ? 'View order' : undefined} onAction={() => onOpen(task)} />
        })}
      </div>
      {pending && (
        <MaintenanceConfirmModal
          machineName={pending.machine.name}
          impact={pending.impact}
          saving={switching === pending.machine.machine_id}
          onClose={() => setPending(null)}
          onConfirm={() => void confirmMaintenance()}
        />
      )}
    </section>
  )
}
