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

async function main() {
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
        totalWeightKg: new Prisma.Decimal(2.5),
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
      ],
    })
    await prisma.machine.update({
      where: { machineId: washer.machineId },
      data: { status: 'BUSY' },
    })
  }

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
        totalWeightKg: new Prisma.Decimal(3),
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
}

main()
  .then(async () => prisma.$disconnect())
  .catch(async (error) => {
    console.error(error)
    await prisma.$disconnect()
    process.exitCode = 1
  })
