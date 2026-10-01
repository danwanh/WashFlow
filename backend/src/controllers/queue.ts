import type { Request, Response } from 'express'
import { prisma } from '../services/api.js'

const stageLabel = (stage: string) => stage === 'WASH' ? 'GIẶT' : 'SẤY'
const machineType = (stage: string) => (stage === 'WASH' ? 'WASHER' : 'DRYER')
const stageRank = (stage: string) => ({ CLASSIFY: 0, WASH: 1, DRY: 2, PACKING: 3 })[stage] ?? 9
const approachingMinutes = Number(process.env.STAGE_APPROACHING_THRESHOLD_MINUTES ?? 5)
const timing = (stage: any, now: Date) => {
  const end = stage.plannedEndAt?.getTime() ?? 0
  const actual = stage.actualEndedAt?.getTime()
  const reference = actual ?? now.getTime()
  const delta = Math.round((reference - end) / 60000)
  const remaining = Math.ceil((end - now.getTime()) / 60000)
  const status = actual
    ? delta > 0 ? 'COMPLETED_LATE' : 'COMPLETED_ON_TIME'
    : delta > 0 ? 'LATE' : remaining <= approachingMinutes ? 'APPROACHING' : 'ON_TIME'
  return {
    timing_status: status,
    delay_minutes: Math.max(0, delta),
    remaining_minutes: Math.max(0, remaining),
    timing_label: status === 'LATE' || status === 'COMPLETED_LATE'
      ? `Đã trễ ${Math.max(0, delta)} phút`
      : status === 'APPROACHING'
        ? `Sắp trễ sau ${Math.max(0, remaining)} phút`
        : actual ? 'Hoàn tất đúng kế hoạch' : `Còn ${Math.max(0, remaining)} phút`,
  }
}
const stageStatusLabel = (status: string) =>
  ({
    PLANNED: 'Chờ vào máy',
    IN_PROGRESS: 'Đang chạy',
    MACHINE_FINISHED: 'Đã chạy xong, chờ dỡ',
    COMPLETED: 'Hoàn tất',
  })[status] ?? 'Đang xử lý'

export async function list(_req: Request, res: Response) {
  const now = new Date()
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
    const addOrderTask = (
      action: string,
      actionType: string,
      button: string,
      detail: string,
    ) => {
      tasks.push({
        order_id: order.orderId,
        batch_id: null,
        batch_stage_id: null,
        rank: 0,
        action,
        action_type: actionType,
        customer: order.customer.name,
        group: 'Đơn hàng',
        detail,
        due: order.pickupAt.toISOString(),
        status: order.status,
        order_status: order.status,
        priority: order.priority,
        slack_minutes: null,
        machine_id: null,
        machine_name: null,
        button,
        alert_count: order.alerts.length,
        weight_kg: null,
        estimated_at: order.estimatedAt.toISOString(),
        planned_start_at: null,
        planned_end_at: null,
        actual_started_at: null,
        actual_machine_finished_at: null,
      })
    }
    if (order.status === 'RECEIVED')
      addOrderTask('PHÂN LOẠI', 'CLASSIFY', 'Xong', 'Xác nhận các mẻ đồ')
    if (order.status === 'FOLDING_PACKING')
      addOrderTask('XẾP ĐỒ', 'PACK', 'Xong', 'Đóng gói toàn bộ đơn')
    if (order.status === 'READY')
      addOrderTask('CHỜ GỬI TIN KHÁCH', 'NOTIFY', 'Gửi tin khách', 'Đơn đã sẵn sàng')

    if (order.status === 'RECEIVED') continue
    for (const batch of order.batches) {
      const stages = [...batch.stages].sort(
        (a, b) => stageRank(a.stage) - stageRank(b.stage),
      )
      const pending = stages.findIndex(
        (stage, index) =>
          stage.status !== 'COMPLETED' &&
          (index === 0 || stages[index - 1]?.status === 'COMPLETED'),
      )
      if (pending < 0) continue
      const stage = stages[pending]!
      if (stage.stage === 'CLASSIFY' || stage.stage === 'PACKING') {
        const duplicate = tasks.some(
          (task) => task.order_id === order.orderId && task.action_type === (stage.stage === 'CLASSIFY' ? 'CLASSIFY' : 'PACK'),
        )
        if (duplicate) continue
      }
      const remainingMinutes = stages
        .slice(pending)
        .reduce(
          (sum, item) =>
            sum +
            (item.stage !== 'CLASSIFY' && item.stage !== 'PACKING' && item.plannedEndAt && item.plannedStartAt
              ? (item.plannedEndAt.getTime() - item.plannedStartAt.getTime()) /
                60000
              : 0),
          0,
        )
      const slackMinutes = Math.round(
        (order.pickupAt.getTime() - now.getTime()) / 60000 - remainingMinutes,
      )
      const label = stageLabel(stage.stage)
      const machine = stage.machine
      const action =
        stage.stage === 'CLASSIFY'
          ? 'PHÂN LOẠI'
          : stage.stage === 'PACKING'
            ? 'XẾP ĐỒ'
            :
        stage.status === 'MACHINE_FINISHED'
          ? `LẤY ĐỒ RA · ${machine?.name ?? label}`
          : stage.status === 'IN_PROGRESS'
            ? `CHỜ LẤY ĐỒ RA · ${machine?.name ?? label}`
            : `VÀO MÁY ${label} · ${machine?.name ?? 'CHƯA GÁN MÁY'}`
      const actionType =
        stage.stage === 'CLASSIFY'
          ? 'CLASSIFY'
          : stage.stage === 'PACKING'
            ? 'PACK'
            :
        stage.status === 'MACHINE_FINISHED'
          ? 'UNLOAD'
          : stage.status === 'IN_PROGRESS'
            ? 'MACHINE_FINISHED'
            : 'START'
      const button =
        stage.stage === 'CLASSIFY' || stage.stage === 'PACKING'
          ? 'Xong'
          :
        stage.status === 'MACHINE_FINISHED'
          ? 'Xong'
          : stage.status === 'IN_PROGRESS'
            ? 'Máy xong'
            : null
      tasks.push({
        order_id: order.orderId,
        batch_id: batch.batchId,
        batch_stage_id: stage.batchStageId,
        rank: 0,
        action,
        action_type: actionType,
        customer: order.customer.name,
        group: `Mẻ ${batch.batchNo}`,
        detail: `${Number(batch.weightKg).toFixed(1)}kg · ${stageStatusLabel(stage.status)}`,
        weight_kg: Number(batch.weightKg),
        estimated_at: order.estimatedAt.toISOString(),
        planned_start_at: stage.plannedStartAt?.toISOString() ?? null,
        planned_end_at: stage.plannedEndAt?.toISOString() ?? null,
        actual_started_at: stage.actualStartedAt?.toISOString() ?? null,
        actual_machine_finished_at:
          stage.actualMachineFinishedAt?.toISOString() ?? null,
        due: order.pickupAt.toISOString(),
        status: batch.status,
        order_status: order.status,
        stage_status: stage.status,
        priority: order.priority,
        slack_minutes: slackMinutes,
        machine_id: stage.machineId,
        machine_name: machine?.name ?? null,
        machine_type: ['WASH', 'DRY'].includes(stage.stage) ? machineType(stage.stage) : undefined,
        button,
        alert_count: order.alerts.length,
        ...timing(stage, now),
      })
    }
  }

  tasks.sort(
    (a, b) =>
      (a.slack_minutes ?? Number.MAX_SAFE_INTEGER) -
        (b.slack_minutes ?? Number.MAX_SAFE_INTEGER) ||
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
