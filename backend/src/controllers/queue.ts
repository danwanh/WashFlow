import type { Request, Response } from 'express'
import { prisma } from '../services/api.js'
import { batchTimings, isManualStage, remainingWorkMs } from '../services/timing.js'
import { autoFinishMachines } from '../services/workflow.js'

const MINUTE = 60_000
const machineLabel = (stage: string) => (stage === 'WASH' ? 'WASHER' : 'DRYER')
const machineType = (stage: string) => (stage === 'WASH' ? 'WASHER' : 'DRYER')
const stageStatusLabel = (status: string) =>
  ({
    PLANNED: 'Waiting for machine',
    IN_PROGRESS: 'Running',
    MACHINE_FINISHED: 'Finished, waiting to unload',
    COMPLETED: 'Completed',
  })[status] ?? 'Processing'
const minutes = (ms: number) => Math.max(0, Math.round(ms / MINUTE))

export async function list(_req: Request, res: Response) {
  // Apply machine cycles that have just elapsed so the queue never shows them still running.
  await autoFinishMachines()
  const now = new Date()
  const readyThreshold = Number(process.env.ALERT_READY_THRESHOLD_MINUTES ?? 30)
  const orders = await prisma.laundryOrder.findMany({
    where: { status: { not: 'COMPLETED' } },
    include: {
      customer: true,
      batches: { include: { stages: { include: { machine: true } } } },
      alerts: { where: { status: { not: 'RESOLVED' } } },
    },
  })

  const tasks: any[] = []
  for (const order of orders) {
    // How far the ETA (or now, once pickup has passed) is beyond the pickup time.
    const orderLateMinutes = minutes(
      Math.max(order.estimatedAt.getTime(), now.getTime()) - order.pickupAt.getTime(),
    )
    const common = {
      order_id: order.orderId,
      rank: 0,
      customer: order.customer.name,
      due: order.pickupAt.toISOString(),
      order_status: order.status,
      priority: order.priority,
      alert_count: order.alerts.length,
      estimated_at: order.estimatedAt.toISOString(),
      order_late_minutes: orderLateMinutes,
    }

    // Sorting and packing are per-batch stages; only the final notification is order-level.
    if (order.status === 'READY') {
      const readySince = (order.readyAt ?? order.updatedAt).getTime()
      const lateAt = readySince + readyThreshold * MINUTE
      tasks.push({
        ...common,
        batch_id: null,
        batch_stage_id: null,
        action: 'NOTIFY CUSTOMER',
        action_type: 'NOTIFY',
        group: 'Order',
        detail: 'Order is ready',
        batch_status: null,
        stage_status: null,
        // No work left, so the slack is simply the time until pickup (negative once overdue).
        slack_minutes: Math.round((order.pickupAt.getTime() - now.getTime()) / MINUTE),
        machine_id: null,
        machine_name: null,
        button: 'Notify customer',
        weight_kg: null,
        planned_start_at: null,
        planned_end_at: null,
        actual_started_at: null,
        actual_machine_finished_at: null,
        phase: 'PLANNED',
        timing_status: now.getTime() > lateAt ? 'LATE' : 'ON_TIME',
        expected_start_at: null,
        expected_end_at: null,
        waiting_since: new Date(readySince).toISOString(),
        late_at: new Date(lateAt).toISOString(),
        approaching_at: null,
        delay_minutes: minutes(now.getTime() - lateAt),
        remaining_minutes: 0,
        timing_label: `Waiting to notify ${minutes(now.getTime() - readySince)} min`,
      })
    }

    for (const batch of order.batches) {
      const timings = batchTimings(batch.stages, now.getTime())
      const pending = timings.findIndex(({ stage }) => stage.status !== 'COMPLETED')
      if (pending < 0) continue
      const { stage, timing } = timings[pending]!
      const remaining = remainingWorkMs(
        timings.map((item) => item.stage),
        pending,
        now.getTime(),
      )
      const slackMinutes = Math.round(
        (order.pickupAt.getTime() - now.getTime() - remaining) / MINUTE,
      )
      const manual = isManualStage(stage.stage)
      const machine = stage.machine
      const action =
        stage.stage === 'CLASSIFY'
          ? 'SORT'
          : stage.stage === 'PACKING'
            ? 'PACK'
            : stage.status === 'MACHINE_FINISHED'
              ? `UNLOAD · ${machine?.name ?? machineLabel(stage.stage)}`
              : stage.status === 'IN_PROGRESS'
                ? `RUNNING · ${machine?.name ?? machineLabel(stage.stage)}`
                : `LOAD ${machineLabel(stage.stage)} · ${machine?.name ?? 'NO MACHINE ASSIGNED'}`
      const actionType =
        stage.stage === 'CLASSIFY'
          ? 'CLASSIFY'
          : stage.stage === 'PACKING'
            ? 'PACK'
            : stage.status === 'MACHINE_FINISHED'
              ? 'UNLOAD'
              : stage.status === 'IN_PROGRESS'
                ? 'MACHINE_FINISHED'
                : 'START'
      const button = manual
        ? 'Done'
        : stage.status === 'MACHINE_FINISHED'
          ? 'Done'
          : stage.status === 'IN_PROGRESS'
            ? 'Machine done'
            : null
      tasks.push({
        ...common,
        batch_id: batch.batchId,
        batch_stage_id: stage.batchStageId,
        stage: stage.stage,
        action,
        action_type: actionType,
        group: `Batch ${batch.batchNo}`,
        detail: `${Number(batch.weightKg).toFixed(1)}kg · ${
          stage.stage === 'CLASSIFY'
            ? 'Waiting to sort'
            : stage.stage === 'PACKING'
              ? 'Waiting to pack'
              : stageStatusLabel(stage.status)
        }`,
        weight_kg: Number(batch.weightKg),
        planned_start_at: stage.plannedStartAt?.toISOString() ?? null,
        planned_end_at: stage.plannedEndAt?.toISOString() ?? null,
        actual_started_at: stage.actualStartedAt?.toISOString() ?? null,
        actual_machine_finished_at: stage.actualMachineFinishedAt?.toISOString() ?? null,
        actual_ended_at: stage.actualEndedAt?.toISOString() ?? null,
        batch_status: batch.status,
        stage_status: stage.status,
        slack_minutes: slackMinutes,
        machine_id: stage.machineId,
        machine_name: machine?.name ?? null,
        machine_type: manual ? undefined : machineType(stage.stage),
        button,
        ...timing,
      })
    }
  }

  tasks.sort(
    (a, b) =>
      (a.slack_minutes ?? Number.MAX_SAFE_INTEGER) - (b.slack_minutes ?? Number.MAX_SAFE_INTEGER) ||
      b.priority - a.priority ||
      new Date(a.due).getTime() - new Date(b.due).getTime() ||
      a.order_id - b.order_id,
  )
  tasks.forEach((task, index) => {
    task.rank = index + 1
  })
  const machines = await prisma.machine.findMany({
    orderBy: [{ type: 'asc' }, { machineId: 'asc' }],
  })
  res.json({
    now: now.toISOString(),
    count: tasks.length,
    tasks,
    machines: machines.map((machine) => ({
      machine_id: machine.machineId,
      name: machine.name,
      type: machine.type,
      status: machine.status,
      capacity_kg: Number(machine.capacityKg),
      processing_minutes: machine.processingMinutes,
      active_task:
        tasks.find(
          (task) =>
            task.machine_id === machine.machineId &&
            ['IN_PROGRESS', 'MACHINE_FINISHED'].includes(task.stage_status),
        ) ?? null,
    })),
  })
}
