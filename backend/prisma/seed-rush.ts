// High-load scenario for trying "đôn đơn" (moving a pickup earlier): more open washing work than
// the washers can run at once, so pulling one order forward has to take other orders' machine
// slots. Wipes all tables like seed.ts, lets the real rescheduler plan everything, then prints
// the schedule and dry-runs a few earlier pickups for the last-finishing order (nothing is saved).
import 'dotenv/config'
import { Prisma } from '../generated/prisma/client.js'
import { prisma } from '../src/services/api.js'
import {
  computeSchedule,
  earliestFeasiblePickup,
  evaluateOrder,
  lateOrderIds,
  loadScheduleState,
  rescheduleAll,
  withPickup,
  type ScheduleResult,
  type ScheduleState,
} from '../src/services/rescheduler.js'

const MINUTE = 60_000

const machines = [
  { name: 'Máy giặt 01', type: 'WASHER', capacityKg: 8, processingMinutes: 45 },
  {
    name: 'Máy giặt 02',
    type: 'WASHER',
    capacityKg: 10,
    processingMinutes: 50,
  },
  {
    name: 'Máy giặt 03',
    type: 'WASHER',
    capacityKg: 12,
    processingMinutes: 55,
  },
  { name: 'Máy giặt 04', type: 'WASHER', capacityKg: 8, processingMinutes: 40 },
  { name: 'Máy sấy 01', type: 'DRYER', capacityKg: 8, processingMinutes: 50 },
  { name: 'Máy sấy 02', type: 'DRYER', capacityKg: 10, processingMinutes: 55 },
  { name: 'Máy sấy 03', type: 'DRYER', capacityKg: 12, processingMinutes: 60 },
  { name: 'Máy sấy 04', type: 'DRYER', capacityKg: 8, processingMinutes: 45 },
] as const

// Every order is already sorted and waiting for a washer, about three washer rounds of work.
// Pickups are minutes from now: rounds 1-2 are tight (each has less slack than one wash cycle,
// so it cannot be pushed back a round), round 3 is loose (it absorbs an order rushed past it).
const orders: Array<{
  customer: string
  service: 'WASH' | 'WASH_DRY'
  itemType: string
  weightKg: number
  pickupInMinutes: number
  priority: number
}> = [
  {
    customer: 'Trần Minh Khoa',
    service: 'WASH',
    itemType: 'shirt',
    weightKg: 4,
    pickupInMinutes: 75,
    priority: 1,
  },
  {
    customer: 'Lê Thảo Vy',
    service: 'WASH',
    itemType: 'towel',
    weightKg: 5,
    pickupInMinutes: 80,
    priority: 0,
  },
  {
    customer: 'Ngô Bảo Anh',
    service: 'WASH',
    itemType: 'dress',
    weightKg: 3.5,
    pickupInMinutes: 85,
    priority: 0,
  },
  {
    customer: 'Đặng Gia Hân',
    service: 'WASH',
    itemType: 'shirt',
    weightKg: 4.5,
    pickupInMinutes: 90,
    priority: 0,
  },
  {
    customer: 'Bùi Đức Long',
    service: 'WASH',
    itemType: 'towel',
    weightKg: 6,
    pickupInMinutes: 135,
    priority: 1,
  },
  {
    customer: 'Vũ Tuấn Kiệt',
    service: 'WASH',
    itemType: 'trousers',
    weightKg: 5,
    pickupInMinutes: 140,
    priority: 0,
  },
  {
    customer: 'Đỗ Ngọc Lan',
    service: 'WASH',
    itemType: 'shirt',
    weightKg: 3,
    pickupInMinutes: 145,
    priority: 0,
  },
  {
    customer: 'Phạm Quốc Huy',
    service: 'WASH',
    itemType: 'trousers',
    weightKg: 6,
    pickupInMinutes: 150,
    priority: 0,
  },
  {
    customer: 'Hoàng Mai Chi',
    service: 'WASH_DRY',
    itemType: 'blanket',
    weightKg: 7,
    pickupInMinutes: 330,
    priority: 0,
  },
  {
    customer: 'Phan Hải Đăng',
    service: 'WASH',
    itemType: 'towel',
    weightKg: 4,
    pickupInMinutes: 300,
    priority: 0,
  },
  {
    customer: 'Trịnh Thu Trang',
    service: 'WASH',
    itemType: 'dress',
    weightKg: 5.5,
    pickupInMinutes: 320,
    priority: 0,
  },
  {
    customer: 'Mai Anh Tuấn',
    service: 'WASH',
    itemType: 'shirt',
    weightKg: 4,
    pickupInMinutes: 360,
    priority: 0,
  },
]

async function resetDatabase() {
  await prisma.$transaction([
    prisma.alert.deleteMany(),
    prisma.notification.deleteMany(),
    prisma.appointmentHistory.deleteMany(),
    prisma.batchStage.deleteMany(),
    prisma.batchItem.deleteMany(),
    prisma.orderBatch.deleteMany(),
    prisma.orderItem.deleteMany(),
    prisma.laundryOrder.deleteMany(),
    prisma.customer.deleteMany(),
    prisma.machine.deleteMany(),
  ])
}

async function seed(now: Date) {
  await prisma.machine.createMany({
    data: machines.map((machine) => ({
      ...machine,
      status: 'AVAILABLE' as const,
    })),
  })
  for (const [index, input] of orders.entries()) {
    const createdAt = new Date(now.getTime() - (30 - index) * MINUTE)
    const classifiedAt = new Date(createdAt.getTime() + 10 * MINUTE)
    const customer = await prisma.customer.create({
      data: {
        name: input.customer,
        phone: `0920000${String(index).padStart(3, '0')}`,
      },
    })
    const weightKg = new Prisma.Decimal(input.weightKg)
    const order = await prisma.laundryOrder.create({
      data: {
        customerId: customer.customerId,
        serviceType: input.service,
        status: 'WAITING',
        totalWeightKg: weightKg,
        totalAmount: new Prisma.Decimal(
          input.weightKg * (input.service === 'WASH_DRY' ? 40000 : 25000),
        ),
        pickupAt: new Date(now.getTime() + input.pickupInMinutes * MINUTE),
        estimatedAt: now,
        priority: input.priority,
        specialNote: `SEED_RUSH_${index + 1}`,
        createdAt,
        classifiedAt,
      },
    })
    const item = await prisma.orderItem.create({
      data: {
        orderId: order.orderId,
        itemType: input.itemType,
        quantity: 3 + index,
        weightKg,
      },
    })
    const batch = await prisma.orderBatch.create({
      data: {
        orderId: order.orderId,
        batchNo: 1,
        weightKg,
        status: 'WAITING',
        currentStage: 'WASH',
      },
    })
    await prisma.batchItem.create({
      data: { batchId: batch.batchId, orderItemId: item.orderItemId, weightKg },
    })
    // Machine and packing times are placeholders; rescheduleAll() below plans them for real.
    const stages = [
      'WASH',
      ...(input.service === 'WASH_DRY' ? ['DRY'] : []),
      'PACKING',
    ] as const
    await prisma.batchStage.createMany({
      data: [
        {
          batchId: batch.batchId,
          stage: 'CLASSIFY',
          status: 'COMPLETED',
          plannedStartAt: createdAt,
          plannedEndAt: classifiedAt,
          actualStartedAt: createdAt,
          actualEndedAt: classifiedAt,
        },
        ...stages.map((stage) => ({
          batchId: batch.batchId,
          stage,
          status: 'PLANNED' as const,
          plannedStartAt: now,
          plannedEndAt: now,
        })),
      ],
    })
  }
}

const time = (value: Date | string | number) =>
  new Date(value).toLocaleTimeString('vi-VN', {
    hour: '2-digit',
    minute: '2-digit',
  })

// The schedule `result` produced, written onto a copy of `state`, so a later trial run's
// stagePlans list only what differs from this baseline (not drift from the clock moving on).
function settle(state: ScheduleState, result: ScheduleResult): ScheduleState {
  const plans = new Map(
    result.stagePlans.map((plan) => [plan.batchStageId, plan]),
  )
  return {
    ...state,
    orders: state.orders.map((order) => ({
      ...order,
      batches: order.batches.map((batch) => ({
        ...batch,
        stages: batch.stages.map((stage) => ({
          ...stage,
          ...plans.get(stage.batchStageId),
        })),
      })),
    })),
  }
}

async function report() {
  const now = new Date()
  const loaded = await loadScheduleState()
  const baseline = computeSchedule(loaded, now)
  const state = settle(loaded, baseline)
  const baselineLate = lateOrderIds(baseline)
  const machineName = new Map(
    (await prisma.machine.findMany()).map((machine) => [
      machine.machineId,
      machine.name,
    ]),
  )
  const eta = new Map(
    baseline.affectedOrders.map((entry) => [entry.orderId, entry]),
  )

  console.log(`\nLịch sau khi seed (bây giờ ${time(now)}):`)
  console.table(
    [...state.orders]
      .sort((a, b) => a.orderId - b.orderId)
      .map((order) => {
        const entry = eta.get(order.orderId)!
        const stages = order.batches[0]!.stages
        const machineStages = stages
          .filter((stage) => stage.machineId)
          .map(
            (stage) =>
              `${machineName.get(stage.machineId!)} ${time(stage.plannedStartAt!)}`,
          )
        return {
          Đơn: `#${order.orderId}`,
          Hẹn: time(order.pickupAt),
          'Dự kiến xong': time(entry.estimatedAt),
          'Dư (phút)': Math.round(
            (order.pickupAt.getTime() - new Date(entry.estimatedAt).getTime()) /
              MINUTE,
          ),
          Máy: machineStages.join(' → '),
        }
      }),
  )

  // Rush the wash-only order that finishes last (its short chain could physically run first, so
  // what stops it is the other orders): try pickups from its ETA downwards in 5-minute steps.
  const washOnly = new Set(
    state.orders
      .filter((order) =>
        order.batches.every((batch) =>
          batch.stages.every((s) => s.stage !== 'DRY'),
        ),
      )
      .map((order) => order.orderId),
  )
  const target = baseline.affectedOrders
    .filter((entry) => washOnly.has(entry.orderId))
    .sort(
      (a, b) =>
        new Date(b.estimatedAt).getTime() - new Date(a.estimatedAt).getTime(),
    )[0]!
  const targetEta = new Date(target.estimatedAt).getTime()
  let displaced: { at: number; orderIds: number[] } | null = null
  let rejected: { at: number; lateIds: number[] } | null = null
  for (let at = targetEta - 5 * MINUTE; at > now.getTime(); at -= 5 * MINUTE) {
    const evaluation = evaluateOrder(
      withPickup(state, target.orderId, new Date(at)),
      target.orderId,
      baselineLate,
      now,
    )
    const others = evaluation.result.changedOrderIds.filter(
      (id) => id !== target.orderId,
    )
    if (evaluation.feasible && others.length && !displaced)
      displaced = { at, orderIds: others }
    // Report the first refusal, preferring one caused by other orders becoming late.
    if (
      !evaluation.feasible &&
      (!rejected || (!rejected.lateIds.length && evaluation.newlyLate.length))
    )
      rejected = {
        at,
        lateIds: evaluation.newlyLate.map((entry) => entry.orderId),
      }
    if (rejected?.lateIds.length) break
  }

  console.log(
    `\nThử đôn đơn #${target.orderId} (đang dự kiến xong ${time(targetEta)}):`,
  )
  console.log(
    `  • Hẹn ≥ ${time(targetEta)}: lịch không đổi, không đơn nào bị ảnh hưởng.`,
  )
  if (displaced)
    console.log(
      `  • Hẹn ${time(displaced.at)}: khả thi, đơn ${displaced.orderIds.map((id) => `#${id}`).join(', ')} bị đổi lịch máy nhưng vẫn đúng hẹn.`,
    )
  if (rejected) {
    const earliest = earliestFeasiblePickup(
      state,
      target.orderId,
      new Date(rejected.at),
      baselineLate,
      now,
    )
    console.log(
      `  • Hẹn ${time(rejected.at)}: bị từ chối${rejected.lateIds.length ? `, vì đơn ${rejected.lateIds.map((id) => `#${id}`).join(', ')} sẽ trễ` : ', vì chính đơn này không kịp'}. Giờ sớm nhất gợi ý: ${earliest ? time(earliest) : 'không có'}.`,
    )
  }
  console.log(
    '\nMở đơn trên trang Hàng đợi / Đơn hàng và đổi giờ hẹn để xem bản xem trước.\n',
  )
}

async function main() {
  await resetDatabase()
  await seed(new Date())
  await rescheduleAll('SEED_RUSH')
  await report()
}

main()
  .catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
