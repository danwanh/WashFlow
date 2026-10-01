import 'dotenv/config'
import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient, Prisma } from '../generated/prisma/client.js'

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
})

async function machine(input: {
  name: string
  type: 'WASHER' | 'DRYER'
  status: 'AVAILABLE' | 'BUSY'
  capacityKg: number
  processingMinutes: number
}) {
  const existing = await prisma.machine.findFirst({
    where: { name: input.name },
  })
  if (existing) {
    return prisma.machine.update({
      where: { machineId: existing.machineId },
      data: input,
    })
  }
  return prisma.machine.create({ data: input })
}

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

type SeedOrderStatus = 'RECEIVED' | 'WAITING' | 'FOLDING_PACKING' | 'READY' | 'COMPLETED'

async function seedOrders(
  status: SeedOrderStatus,
  count: number,
  now: Date,
  washerIds: number[],
  dryerIds: number[],
) {
  const names = [
    'Trần Minh Anh',
    'Lê Hoàng Nam',
    'Phạm Thu Hà',
    'Đỗ Gia Bảo',
    'Vũ Ngọc Lan',
  ]
  const itemTypes = ['shirt', 'trousers', 'blanket', 'towel', 'dress']

  for (let index = 0; index < count; index += 1) {
    const customer = await prisma.customer.create({
      data: {
        name: names[index % names.length]!,
        phone: `09100000${String(status.length * 10 + index).padStart(2, '0')}`,
      },
    })
    // Finished orders started long enough ago that every actual time is in the past.
    const createdAt = new Date(
      now.getTime() -
        (index + (status === 'RECEIVED' || status === 'WAITING' ? 1 : 4)) * 60 * 60 * 1000,
    )
    const isCompleted = status === 'COMPLETED'
    const isReady = status === 'READY'
    const isPacking = status === 'FOLDING_PACKING'
    const isProcessed = isCompleted || isReady || isPacking
    const isClassified = status !== 'RECEIVED'
    const isPacked = isCompleted || isReady
    const itemType = itemTypes[index % itemTypes.length]!
    const weightKg = 1.5 + index * 0.5
    const serviceType = index % 2 === 0 ? 'WASH_DRY' : 'WASH'
    const serviceRate = serviceType === 'WASH_DRY' ? 40000 : 25000
    const isHistorical = isProcessed
    const scheduleOffsetHours = status === 'RECEIVED' ? 1 : status === 'WAITING' ? 4 : 0
    const washStart = isHistorical
      ? new Date(createdAt.getTime() + 15 * 60 * 1000)
      : new Date(now.getTime() + (index + scheduleOffsetHours) * 60 * 60 * 1000)
    const washEnd = new Date(washStart.getTime() + 45 * 60 * 1000)
    const dryStart = new Date(washEnd.getTime() + 10 * 60 * 1000)
    const dryEnd = new Date(dryStart.getTime() + 50 * 60 * 1000)

    const order = await prisma.laundryOrder.create({
      data: {
        customerId: customer.customerId,
        serviceType,
        status,
        totalWeightKg: new Prisma.Decimal(weightKg),
        totalAmount: new Prisma.Decimal(weightKg * serviceRate),
        pickupAt: new Date(now.getTime() + (index + 2) * 60 * 60 * 1000),
        estimatedAt: isProcessed
          ? new Date(now.getTime() - 30 * 60 * 1000)
          : new Date(now.getTime() + 90 * 60 * 1000),
        priority: index % 2,
        specialNote: `SEED_STATUS_${status}_${index + 1}`,
        createdAt,
        ...(status !== 'RECEIVED' ? { classifiedAt: new Date(createdAt.getTime() + 10 * 60 * 1000) } : {}),
        ...(isPacked
          ? { packingCompletedAt: new Date(now.getTime() - 20 * 60 * 1000) }
          : {}),
        ...(isReady || isCompleted ? { readyAt: new Date(now.getTime() - 15 * 60 * 1000) } : {}),
        ...(isCompleted ? { completedAt: new Date(now.getTime() - 5 * 60 * 1000) } : {}),
      },
    })
    const item = await prisma.orderItem.create({
      data: {
        orderId: order.orderId,
        itemType,
        quantity: 2 + index,
        weightKg: new Prisma.Decimal(weightKg),
      },
    })
    const batch = await prisma.orderBatch.create({
      data: {
        orderId: order.orderId,
        batchNo: 1,
        weightKg: new Prisma.Decimal(weightKg),
        status: isPacked ? 'COMPLETED' : 'WAITING',
        currentStage: isPacked ? null : isPacking ? 'PACKING' : isClassified ? 'WASH' : 'CLASSIFY',
        ...(isPacked ? { completedAt: new Date(now.getTime() - 25 * 60 * 1000) } : {}),
      },
    })
    await prisma.batchItem.create({
      data: { batchId: batch.batchId, orderItemId: item.orderItemId, weightKg: new Prisma.Decimal(weightKg) },
    })
    const classifyStart = new Date(createdAt.getTime())
    const classifyEnd = new Date(classifyStart.getTime() + 10 * 60 * 1000)
    await prisma.batchStage.create({
      data: {
        batchId: batch.batchId,
        stage: 'CLASSIFY',
        status: isClassified ? 'COMPLETED' : 'PLANNED',
        plannedStartAt: classifyStart,
        plannedEndAt: classifyEnd,
        actualStartedAt: classifyStart,
        ...(isClassified ? { actualEndedAt: classifyEnd } : {}),
      },
    })
    await prisma.batchStage.create({
      data: {
        batchId: batch.batchId,
        machineId: washerIds[index % washerIds.length],
        stage: 'WASH',
        status: isProcessed ? 'COMPLETED' : 'PLANNED',
        plannedStartAt: washStart,
        plannedEndAt: washEnd,
        ...(isProcessed
          ? {
              actualStartedAt: washStart,
              actualMachineFinishedAt: washEnd,
              actualEndedAt: new Date(washEnd.getTime() + 5 * 60 * 1000),
            }
          : {}),
      },
    })
    if (serviceType === 'WASH_DRY') {
      await prisma.batchStage.create({
        data: {
          batchId: batch.batchId,
          machineId: dryerIds[index % dryerIds.length],
          stage: 'DRY',
          status: isProcessed ? 'COMPLETED' : 'PLANNED',
          plannedStartAt: dryStart,
          plannedEndAt: dryEnd,
          ...(isProcessed
            ? {
                actualStartedAt: dryStart,
                actualMachineFinishedAt: dryEnd,
                actualEndedAt: new Date(dryEnd.getTime() + 5 * 60 * 1000),
              }
            : {}),
        },
      })
    }
    const packingStart = new Date(
      (serviceType === 'WASH_DRY' ? dryEnd : washEnd).getTime() + 5 * 60 * 1000,
    )
    const packingEnd = new Date(packingStart.getTime() + 15 * 60 * 1000)
    await prisma.batchStage.create({
      data: {
        batchId: batch.batchId,
        stage: 'PACKING',
        status: isPacked ? 'COMPLETED' : 'PLANNED',
        plannedStartAt: packingStart,
        plannedEndAt: packingEnd,
        ...(isPacked ? { actualEndedAt: packingEnd } : {}),
      },
    })
  }
}

async function main() {
  await resetDatabase()

  const washer = await machine({
    name: 'Máy giặt 01',
    type: 'WASHER',
    status: 'AVAILABLE',
    capacityKg: 8,
    processingMinutes: 45,
  })
  const dryer = await machine({
    name: 'Máy sấy 01',
    type: 'DRYER',
    status: 'AVAILABLE',
    capacityKg: 8,
    processingMinutes: 50,
  })
  const washer2 = await machine({
    name: 'Máy giặt 02',
    type: 'WASHER',
    status: 'AVAILABLE',
    capacityKg: 10,
    processingMinutes: 50,
  })
  const washer3 = await machine({
    name: 'Máy giặt 03',
    type: 'WASHER',
    status: 'AVAILABLE',
    capacityKg: 12,
    processingMinutes: 55,
  })
  const washer4 = await machine({
    name: 'Máy giặt 04',
    type: 'WASHER',
    status: 'AVAILABLE',
    capacityKg: 8,
    processingMinutes: 40,
  })
  const dryer2 = await machine({
    name: 'Máy sấy 02',
    type: 'DRYER',
    status: 'AVAILABLE',
    capacityKg: 10,
    processingMinutes: 55,
  })
  const dryer3 = await machine({
    name: 'Máy sấy 03',
    type: 'DRYER',
    status: 'AVAILABLE',
    capacityKg: 12,
    processingMinutes: 60,
  })
  const dryer4 = await machine({
    name: 'Máy sấy 04',
    type: 'DRYER',
    status: 'AVAILABLE',
    capacityKg: 8,
    processingMinutes: 45,
  })

  const customer = await prisma.customer.upsert({
    where: { customerId: 1 },
    update: { name: 'Nguyễn Văn A', phone: '0900000000' },
    create: { name: 'Nguyễn Văn A', phone: '0900000000' },
  })

  const existingProcessing = await prisma.laundryOrder.findFirst({
    where: {
      customerId: customer.customerId,
      specialNote: 'SEED_PROCESSING_ORDER',
    },
  })
  if (!existingProcessing) {
    const now = new Date()
    const order = await prisma.laundryOrder.create({
      data: {
        customerId: customer.customerId,
        serviceType: 'WASH_DRY',
         status: 'WAITING',
         classifiedAt: new Date(now.getTime() - 5 * 60 * 1000),
         totalWeightKg: new Prisma.Decimal(2.5),
         totalAmount: new Prisma.Decimal(2.5 * 40000),
        pickupAt: new Date(now.getTime() + 4 * 60 * 60 * 1000),
        estimatedAt: new Date(now.getTime() + 2 * 60 * 60 * 1000),
        priority: 1,
        specialNote: 'SEED_PROCESSING_ORDER',
      },
    })
    const item = await prisma.orderItem.create({
      data: {
        orderId: order.orderId,
        itemType: 'shirt',
        quantity: 5,
        weightKg: new Prisma.Decimal(2.5),
        note: 'Áo sơ mi màu',
      },
    })
    const batch = await prisma.orderBatch.create({
      data: {
        orderId: order.orderId,
        batchNo: 1,
        weightKg: new Prisma.Decimal(2.5),
        status: 'WASHING',
        currentStage: 'WASH',
      },
    })
    await prisma.batchItem.create({
      data: {
        batchId: batch.batchId,
        orderItemId: item.orderItemId,
        weightKg: new Prisma.Decimal(2.5),
      },
    })
    await prisma.batchStage.createMany({
      data: [
        {
          batchId: batch.batchId,
          stage: 'CLASSIFY',
          status: 'COMPLETED',
          plannedStartAt: new Date(now.getTime() - 15 * 60 * 1000),
          plannedEndAt: new Date(now.getTime() - 5 * 60 * 1000),
          actualStartedAt: new Date(now.getTime() - 15 * 60 * 1000),
          actualEndedAt: new Date(now.getTime() - 5 * 60 * 1000),
        },
        {
          batchId: batch.batchId,
          machineId: washer.machineId,
          stage: 'WASH',
          status: 'IN_PROGRESS',
          plannedStartAt: now,
          plannedEndAt: new Date(now.getTime() + 45 * 60 * 1000),
          actualStartedAt: now,
        },
        {
          batchId: batch.batchId,
          machineId: dryer.machineId,
          stage: 'DRY',
          status: 'PLANNED',
          plannedStartAt: new Date(now.getTime() + 50 * 60 * 1000),
          plannedEndAt: new Date(now.getTime() + 100 * 60 * 1000),
        },
        {
          batchId: batch.batchId,
          stage: 'PACKING',
          status: 'PLANNED',
          plannedStartAt: new Date(now.getTime() + 100 * 60 * 1000),
          plannedEndAt: new Date(now.getTime() + 115 * 60 * 1000),
        },
      ],
    })
  }
  await prisma.machine.update({
    where: { machineId: washer.machineId },
    data: { status: 'BUSY' },
  })

  const existingReady = await prisma.laundryOrder.findFirst({
    where: { customerId: customer.customerId, specialNote: 'SEED_READY_ORDER' },
  })
  if (!existingReady) {
    const now = new Date()
    const order = await prisma.laundryOrder.create({
      data: {
        customerId: customer.customerId,
        serviceType: 'WASH',
         status: 'READY',
         classifiedAt: new Date(now.getTime() - 120 * 60 * 1000),
         totalWeightKg: new Prisma.Decimal(3),
         totalAmount: new Prisma.Decimal(3 * 25000),
        pickupAt: new Date(now.getTime() + 90 * 60 * 1000),
        estimatedAt: new Date(now.getTime() - 10 * 60 * 1000),
        priority: 0,
        specialNote: 'SEED_READY_ORDER',
        packingCompletedAt: new Date(now.getTime() - 15 * 60 * 1000),
        readyAt: new Date(now.getTime() - 15 * 60 * 1000),
      },
    })
    const item = await prisma.orderItem.create({
      data: {
        orderId: order.orderId,
        itemType: 'towel',
        quantity: 4,
        weightKg: new Prisma.Decimal(3),
      },
    })
    const batch = await prisma.orderBatch.create({
      data: {
        orderId: order.orderId,
        batchNo: 1,
        weightKg: new Prisma.Decimal(3),
        status: 'COMPLETED',
        completedAt: now,
      },
    })
    await prisma.batchItem.create({
      data: {
        batchId: batch.batchId,
        orderItemId: item.orderItemId,
        weightKg: new Prisma.Decimal(3),
      },
    })
    await prisma.batchStage.create({
      data: {
        batchId: batch.batchId,
        machineId: washer.machineId,
        stage: 'WASH',
        status: 'COMPLETED',
        plannedStartAt: new Date(now.getTime() - 120 * 60 * 1000),
        plannedEndAt: new Date(now.getTime() - 75 * 60 * 1000),
        actualStartedAt: new Date(now.getTime() - 120 * 60 * 1000),
        actualMachineFinishedAt: new Date(now.getTime() - 75 * 60 * 1000),
        actualEndedAt: new Date(now.getTime() - 70 * 60 * 1000),
      },
    })
    await prisma.batchStage.createMany({
      data: [
        {
          batchId: batch.batchId,
          stage: 'CLASSIFY',
          status: 'COMPLETED',
          plannedStartAt: new Date(now.getTime() - 130 * 60 * 1000),
          plannedEndAt: new Date(now.getTime() - 120 * 60 * 1000),
          actualStartedAt: new Date(now.getTime() - 130 * 60 * 1000),
          actualEndedAt: new Date(now.getTime() - 120 * 60 * 1000),
        },
        {
          batchId: batch.batchId,
          stage: 'PACKING',
          status: 'COMPLETED',
          plannedStartAt: new Date(now.getTime() - 70 * 60 * 1000),
          plannedEndAt: new Date(now.getTime() - 55 * 60 * 1000),
          actualEndedAt: new Date(now.getTime() - 15 * 60 * 1000),
        },
      ],
    })
    await prisma.notification.create({
      data: {
        orderId: order.orderId,
        type: 'READY_FOR_PICKUP',
        channel: 'SMS',
        status: 'FAILED',
        content: 'Your laundry order is ready for pickup.',
      },
    })
    await prisma.alert.create({
      data: {
        orderId: order.orderId,
        type: 'LATE_RISK',
        severity: 'WARNING',
        status: 'OPEN',
        reason: 'Final notification has not succeeded',
      },
    })
  }

  const now = new Date()
  const washerIds = [washer.machineId, washer2.machineId, washer3.machineId, washer4.machineId]
  const dryerIds = [dryer.machineId, dryer2.machineId, dryer3.machineId, dryer4.machineId]
  await seedOrders('RECEIVED', 3, now, washerIds, dryerIds)
  await seedOrders('WAITING', 3, now, washerIds, dryerIds)
  await seedOrders('FOLDING_PACKING', 3, now, washerIds, dryerIds)
  await seedOrders('READY', 3, now, washerIds, dryerIds)
  await seedOrders('COMPLETED', 3, now, washerIds, dryerIds)
  await addManualStages()
}

// Every batch runs sorting (CLASSIFY) before and PACKING after its machine stages.
// The orders above only create WASH/DRY, so add the manual stages to match each order's status.
async function addManualStages() {
  const MINUTE = 60 * 1000
  const orders = await prisma.laundryOrder.findMany({
    include: { batches: { include: { stages: true } } },
  })
  for (const order of orders) {
    const sorted = order.status !== 'RECEIVED'
    const packed = order.status === 'READY' || order.status === 'COMPLETED'
    for (const batch of order.batches) {
      if (batch.stages.some((stage) => stage.stage === 'CLASSIFY')) continue
      const machineStages = [...batch.stages].sort(
        (a, b) => (a.plannedStartAt?.getTime() ?? 0) - (b.plannedStartAt?.getTime() ?? 0),
      )
      const classifyStart = order.createdAt
      const classifyEnd = new Date(classifyStart.getTime() + 10 * MINUTE)
      const lastMachineEnd =
        machineStages.at(-1)?.actualEndedAt ?? machineStages.at(-1)?.plannedEndAt ?? classifyEnd
      const packingEnd = new Date(lastMachineEnd.getTime() + 15 * MINUTE)
      await prisma.batchStage.createMany({
        data: [
          {
            batchId: batch.batchId,
            stage: 'CLASSIFY',
            status: sorted ? 'COMPLETED' : 'PLANNED',
            plannedStartAt: classifyStart,
            plannedEndAt: classifyEnd,
            actualStartedAt: classifyStart,
            actualEndedAt: sorted ? (order.classifiedAt ?? classifyEnd) : null,
          },
          {
            batchId: batch.batchId,
            stage: 'PACKING',
            status: packed ? 'COMPLETED' : 'PLANNED',
            plannedStartAt: lastMachineEnd,
            plannedEndAt: packingEnd,
            actualEndedAt: packed ? (order.packingCompletedAt ?? packingEnd) : null,
          },
        ],
      })
      // A batch is COMPLETED only after packing; before that it waits on its next stage.
      const nextStage = !sorted
        ? 'CLASSIFY'
        : machineStages.find((stage) => stage.status !== 'COMPLETED')?.stage ??
          (packed ? null : 'PACKING')
      if (nextStage === 'CLASSIFY' || nextStage === 'PACKING')
        await prisma.orderBatch.update({
          where: { batchId: batch.batchId },
          data: { status: 'WAITING', currentStage: nextStage, completedAt: null },
        })
    }
  }
}

main()
  .then(async () => prisma.$disconnect())
  .catch(async (error) => {
    console.error(error)
    await prisma.$disconnect()
    process.exitCode = 1
  })
