// Test-scenario seed: wipes every table, then creates machines and one order per workflow case
// (sorting, waiting for a machine, running, waiting for unload, packing, ready, completed,
// late risk, overdue pickup, split/merged batches, forgotten-work alerts...). Times are relative
// to now so the queue, alerts and overview show each case right after seeding. Statuses of
// batches, orders and machines are derived from the stages the same way the workflow does.
// Alerts are not seeded (except history): the server's alert scan creates them on its next tick.
// `--on-time` (npm run db:seed:ontime) seeds a calmer set instead: no stage late, no alerts.
import 'dotenv/config'
import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient, Prisma } from '../generated/prisma/client.js'

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
})

const MINUTE = 60_000
const now = Date.now()
const at = (minutes: number) => new Date(now + minutes * MINUTE)

type StageName = 'CLASSIFY' | 'WASH' | 'DRY' | 'PACKING'
type StageStatus = 'PLANNED' | 'IN_PROGRESS' | 'MACHINE_FINISHED' | 'COMPLETED'
type ServiceType = 'WASH' | 'DRY' | 'WASH_DRY'

// Offsets in minutes from now.
type StageSpec = {
  stage: StageName
  status: StageStatus
  machine?: string
  start: number
  end: number
  startedAt?: number
  finishedAt?: number
  endedAt?: number
}

type OrderSpec = {
  scenario: string
  customer: [name: string, phone: string]
  service: ServiceType
  priority?: number
  createdAt: number
  pickupAt: number
  items: { type: string; quantity: number; kg: number; note?: string }[]
  // Each batch takes [item index, kg] parts: one item may be split over batches, several items
  // may share a batch.
  batches: { items: [number, number][]; stages: StageSpec[] }[]
  readyAt?: number
  completedAt?: number
  notifications?: { status: 'SENT' | 'FAILED'; at: number }[]
  appointments?: { oldPickupAt: number; at: number; reason: string }[]
  alerts?: {
    type: string
    severity: string
    status: 'OPEN' | 'SNOOZED' | 'RESOLVED'
    reason: string
    detectedAt: number
    snoozedUntil?: number
    resolvedAt?: number
  }[]
}

// ---- stage builders --------------------------------------------------------------------------

// Sorting starts as soon as the order is accepted (as in POST /api/orders).
const sorting = (start: number, end = start + 10): StageSpec => ({
  stage: 'CLASSIFY',
  status: 'PLANNED',
  start,
  end,
  startedAt: start,
})
const sorted = (start: number, end = start + 10): StageSpec => ({
  stage: 'CLASSIFY',
  status: 'COMPLETED',
  start,
  end,
  startedAt: start,
  endedAt: end,
})
const planned = (stage: StageName, start: number, end: number, machine?: string): StageSpec => ({
  stage,
  status: 'PLANNED',
  start,
  end,
  ...(machine ? { machine } : {}),
})
const running = (
  stage: 'WASH' | 'DRY',
  machine: string,
  startedAt: number,
  minutes: number,
): StageSpec => ({
  stage,
  status: 'IN_PROGRESS',
  machine,
  start: startedAt,
  end: startedAt + minutes,
  startedAt,
})
const waitingUnload = (
  stage: 'WASH' | 'DRY',
  machine: string,
  startedAt: number,
  minutes: number,
): StageSpec => ({
  stage,
  status: 'MACHINE_FINISHED',
  machine,
  start: startedAt,
  end: startedAt + minutes,
  startedAt,
  finishedAt: startedAt + minutes,
})
// A finished machine stage was unloaded 3 minutes after the cycle ended.
const washed = (
  stage: 'WASH' | 'DRY',
  machine: string,
  start: number,
  minutes: number,
): StageSpec => ({
  stage,
  status: 'COMPLETED',
  machine,
  start,
  end: start + minutes,
  startedAt: start,
  finishedAt: start + minutes,
  endedAt: start + minutes + 3,
})
// A finished machine stage unloaded right at its planned end, so it does not count as late.
const unloaded = (
  stage: 'WASH' | 'DRY',
  machine: string,
  start: number,
  minutes: number,
): StageSpec => ({
  stage,
  status: 'COMPLETED',
  machine,
  start,
  end: start + minutes + 3,
  startedAt: start,
  finishedAt: start + minutes,
  endedAt: start + minutes + 3,
})
const packed = (start: number, end = start + 15): StageSpec => ({
  stage: 'PACKING',
  status: 'COMPLETED',
  start,
  end,
  startedAt: start,
  endedAt: end,
})

// ---- machines ---------------------------------------------------------------------------------

const machineSpecs = [
  { name: 'Washer 01', type: 'WASHER', capacityKg: 8, processingMinutes: 45 },
  { name: 'Washer 02', type: 'WASHER', capacityKg: 10, processingMinutes: 50 },
  { name: 'Washer 03', type: 'WASHER', capacityKg: 12, processingMinutes: 55 },
  // Out of service: tests that it gets no work and can be switched back.
  { name: 'Washer 04', type: 'WASHER', capacityKg: 8, processingMinutes: 40, maintenance: true },
  { name: 'Washer 05', type: 'WASHER', capacityKg: 15, processingMinutes: 60 },
  { name: 'Washer 06', type: 'WASHER', capacityKg: 10, processingMinutes: 45 },
  { name: 'Dryer 01', type: 'DRYER', capacityKg: 8, processingMinutes: 50 },
  { name: 'Dryer 02', type: 'DRYER', capacityKg: 10, processingMinutes: 55 },
  { name: 'Dryer 03', type: 'DRYER', capacityKg: 12, processingMinutes: 60 },
  { name: 'Dryer 04', type: 'DRYER', capacityKg: 8, processingMinutes: 45 },
] as const

const W1 = 'Washer 01'
const W2 = 'Washer 02'
const W3 = 'Washer 03'
const W5 = 'Washer 05'
const W6 = 'Washer 06'
const D1 = 'Dryer 01'
const D2 = 'Dryer 02'
const D3 = 'Dryer 03'
const D4 = 'Dryer 04'

// ---- scenarios --------------------------------------------------------------------------------

const DAY = 24 * 60

const orders: OrderSpec[] = [
  // RECEIVED ----------------------------------------------------------------------------------
  {
    scenario: 'Just received, sorting',
    customer: ['Emma Johnson', '0901000001'],
    service: 'WASH_DRY',
    createdAt: -3,
    pickupAt: 240,
    items: [{ type: 'shirt', quantity: 6, kg: 3 }],
    batches: [
      {
        items: [[0, 3]],
        stages: [
          sorting(-3),
          planned('WASH', 20, 70, W6),
          planned('DRY', 75, 120, D4),
          planned('PACKING', 120, 135),
        ],
      },
    ],
  },
  {
    scenario: 'Sorting overdue (manual stage late)',
    customer: ['Liam Smith', '0901000002'],
    service: 'WASH',
    priority: 1,
    createdAt: -40,
    pickupAt: 150,
    items: [{ type: 'dark', quantity: 8, kg: 4 }],
    batches: [
      {
        items: [[0, 4]],
        stages: [sorting(-40), planned('WASH', 5, 60, W3), planned('PACKING', 60, 75)],
      },
    ],
  },
  {
    scenario: 'One heavy item split into 2 batches',
    customer: ['Olivia Brown', '0901000003'],
    service: 'WASH_DRY',
    createdAt: -5,
    pickupAt: 360,
    items: [{ type: 'blanket', quantity: 3, kg: 18, note: 'Large comforter' }],
    batches: [
      {
        items: [[0, 10]],
        stages: [
          sorting(-5),
          planned('WASH', 65, 115, W2),
          planned('DRY', 120, 175, D2),
          planned('PACKING', 175, 190),
        ],
      },
      {
        items: [[0, 8]],
        stages: [
          sorting(-5),
          planned('WASH', 40, 85, W1),
          planned('DRY', 90, 140, D1),
          planned('PACKING', 140, 155),
        ],
      },
    ],
  },
  {
    scenario: 'Several items of one group merged into 1 batch',
    customer: ['Noah Davis', '0901000004'],
    service: 'WASH',
    createdAt: -6,
    pickupAt: 300,
    items: [
      { type: 'shirt', quantity: 4, kg: 2 },
      { type: 'white', quantity: 3, kg: 1.5, note: 'Whites' },
    ],
    batches: [
      {
        items: [
          [0, 2],
          [1, 1.5],
        ],
        stages: [sorting(-6), planned('WASH', 60, 115, W3), planned('PACKING', 115, 130)],
      },
    ],
  },

  // WAITING -----------------------------------------------------------------------------------
  {
    scenario: 'Sorted, not yet time to load',
    customer: ['Ava Wilson', '0901000005'],
    service: 'WASH_DRY',
    createdAt: -30,
    pickupAt: 240,
    items: [{ type: 'towel', quantity: 10, kg: 5 }],
    batches: [
      {
        items: [[0, 5]],
        stages: [
          sorted(-30),
          planned('WASH', 40, 85, W1),
          planned('DRY', 85, 145, D3),
          planned('PACKING', 145, 160),
        ],
      },
    ],
  },
  {
    scenario: 'Time to load (drag the bag onto an idle washer)',
    customer: ['James Taylor', '0901000006'],
    service: 'WASH_DRY',
    createdAt: -25,
    pickupAt: 200,
    items: [{ type: 'light', quantity: 7, kg: 4 }],
    batches: [
      {
        items: [[0, 4]],
        stages: [
          sorted(-25, -15),
          planned('WASH', -1, 44, W6),
          planned('DRY', 45, 90, D4),
          planned('PACKING', 90, 105),
        ],
      },
    ],
  },
  {
    scenario: 'Waiting for a machine too long (forgotten batch alert)',
    customer: ['Sophia Anderson', '0901000007'],
    service: 'WASH',
    createdAt: -65,
    pickupAt: 120,
    items: [{ type: 'color', quantity: 9, kg: 4.5 }],
    batches: [
      {
        items: [[0, 4.5]],
        stages: [sorted(-65, -55), planned('WASH', -45, 0, W6), planned('PACKING', 0, 15)],
      },
    ],
  },
  {
    scenario: 'Washing',
    customer: ['Lucas Thomas', '0901000008'],
    service: 'WASH_DRY',
    createdAt: -25,
    pickupAt: 180,
    items: [{ type: 'sport', quantity: 5, kg: 3.5 }],
    batches: [
      {
        items: [[0, 3.5]],
        stages: [
          sorted(-25, -15),
          running('WASH', W1, -10, 45),
          planned('DRY', 45, 90, D4),
          planned('PACKING', 90, 105),
        ],
      },
    ],
  },
  {
    scenario: 'Almost washed (machine switches to waiting for unload in ~3 min)',
    customer: ['Mia Martinez', '0901000009'],
    service: 'WASH',
    createdAt: -65,
    pickupAt: 120,
    items: [{ type: 'jeans', quantity: 4, kg: 6 }],
    batches: [
      {
        items: [[0, 6]],
        stages: [sorted(-65, -55), running('WASH', W3, -52, 55), planned('PACKING', 5, 20)],
      },
    ],
  },
  {
    scenario: 'Washed, waiting to unload',
    customer: ['Ethan Moore', '0901000010'],
    service: 'WASH_DRY',
    createdAt: -80,
    pickupAt: 200,
    items: [{ type: 'shirt', quantity: 12, kg: 6 }],
    batches: [
      {
        items: [[0, 6]],
        stages: [
          sorted(-80, -70),
          waitingUnload('WASH', W2, -55, 50),
          planned('DRY', 0, 55, D2),
          planned('PACKING', 55, 70),
        ],
      },
    ],
  },
  {
    scenario: 'Dried but not unloaded (critical alert)',
    customer: ['Isabella Clark', '0901000011'],
    service: 'WASH_DRY',
    priority: 1,
    createdAt: -150,
    pickupAt: 30,
    items: [{ type: 'towel', quantity: 12, kg: 7 }],
    batches: [
      {
        items: [[0, 7]],
        stages: [
          sorted(-150, -140),
          washed('WASH', W1, -135, 45),
          waitingUnload('DRY', D3, -85, 60),
          planned('PACKING', -20, -5),
        ],
      },
    ],
  },
  {
    scenario: 'Drying',
    customer: ['Mason Lewis', '0901000012'],
    service: 'WASH_DRY',
    createdAt: -120,
    pickupAt: 120,
    items: [{ type: 'dark', quantity: 10, kg: 5 }],
    batches: [
      {
        items: [[0, 5]],
        stages: [
          sorted(-120, -110),
          washed('WASH', W5, -105, 60),
          running('DRY', D1, -20, 50),
          planned('PACKING', 30, 45),
        ],
      },
    ],
  },
  {
    scenario: 'Dry-only service, time to load the dryer',
    customer: ['Charlotte Walker', '0901000013'],
    service: 'DRY',
    createdAt: -15,
    pickupAt: 150,
    items: [{ type: 'blanket', quantity: 1, kg: 3, note: 'Dry only' }],
    batches: [
      {
        items: [[0, 3]],
        stages: [sorted(-15, -5), planned('DRY', -1, 44, D4), planned('PACKING', 44, 59)],
      },
    ],
  },
  {
    scenario: 'Late risk (alert snoozed 20 min)',
    customer: ['Logan Hall', '0901000014'],
    service: 'WASH_DRY',
    priority: 1,
    createdAt: -40,
    pickupAt: 90,
    items: [{ type: 'delicate', quantity: 3, kg: 2, note: 'Wool, gentle wash' }],
    batches: [
      {
        items: [[0, 2]],
        stages: [
          sorted(-40, -30),
          planned('WASH', 50, 95, W6),
          planned('DRY', 100, 150, D1),
          planned('PACKING', 150, 165),
        ],
      },
    ],
    alerts: [
      {
        type: 'LATE_RISK',
        severity: 'WARNING',
        status: 'SNOOZED',
        reason: 'Expected to finish after the customer pickup time',
        detectedAt: -10,
        snoozedUntil: 20,
      },
    ],
  },
  {
    scenario: 'Past the pickup time',
    customer: ['Amelia Young', '0901000015'],
    service: 'WASH_DRY',
    createdAt: -200,
    pickupAt: -20,
    items: [{ type: 'color', quantity: 8, kg: 5 }],
    batches: [
      {
        items: [[0, 5]],
        stages: [
          sorted(-200, -190),
          washed('WASH', W2, -185, 50),
          planned('DRY', 5, 65, D3),
          planned('PACKING', 65, 80),
        ],
      },
    ],
  },
  {
    scenario: '2-batch order at different stages (1 washing, 1 waiting to pack)',
    customer: ['Benjamin King', '0901000016'],
    service: 'WASH',
    createdAt: -90,
    pickupAt: 240,
    items: [
      { type: 'jeans', quantity: 6, kg: 9 },
      { type: 'shirt', quantity: 6, kg: 3 },
    ],
    batches: [
      {
        items: [[0, 9]],
        stages: [sorted(-90, -80), running('WASH', W5, -30, 60), planned('PACKING', 30, 45)],
      },
      {
        items: [[1, 3]],
        stages: [sorted(-90, -80), washed('WASH', W1, -78, 45), planned('PACKING', -28, -13)],
      },
    ],
  },
  {
    scenario: 'Customer moved the pickup time',
    customer: ['Harper Wright', '0901000017'],
    service: 'WASH',
    createdAt: -20,
    pickupAt: 300,
    items: [{ type: 'light', quantity: 5, kg: 3 }],
    batches: [
      {
        items: [[0, 3]],
        stages: [sorted(-20, -10), planned('WASH', 100, 145, W6), planned('PACKING', 145, 160)],
      },
    ],
    appointments: [{ oldPickupAt: 60, at: -8, reason: 'Customer asked for a later pickup' }],
  },
  {
    scenario: 'Pickup tomorrow',
    customer: ['Henry Scott', '0901000018'],
    service: 'WASH_DRY',
    createdAt: -10,
    pickupAt: DAY + 120,
    items: [{ type: 'black', quantity: 6, kg: 4 }],
    batches: [
      {
        items: [[0, 4]],
        stages: [
          sorted(-10, 0),
          planned('WASH', 180, 230, W2),
          planned('DRY', 235, 290, D2),
          planned('PACKING', 290, 305),
        ],
      },
    ],
  },

  // FOLDING_PACKING ---------------------------------------------------------------------------
  {
    scenario: 'Washed and dried, waiting to pack',
    customer: ['Evelyn Green', '0901000019'],
    service: 'WASH_DRY',
    createdAt: -150,
    pickupAt: 60,
    items: [{ type: 'shirt', quantity: 8, kg: 4 }],
    batches: [
      {
        items: [[0, 4]],
        stages: [
          sorted(-150, -140),
          washed('WASH', W2, -135, 50),
          washed('DRY', D1, -80, 50),
          planned('PACKING', -5, 10),
        ],
      },
    ],
  },
  {
    scenario: 'Packing forgotten (waiting to pack too long alert)',
    customer: ['Jack Baker', '0901000020'],
    service: 'WASH',
    createdAt: -200,
    pickupAt: 15,
    items: [{ type: 'dark', quantity: 7, kg: 4 }],
    batches: [
      {
        items: [[0, 4]],
        stages: [sorted(-200, -190), washed('WASH', W3, -185, 55), planned('PACKING', -125, -110)],
      },
    ],
  },

  // READY -------------------------------------------------------------------------------------
  {
    scenario: 'Ready, customer not notified',
    customer: ['Abigail Adams', '0901000021'],
    service: 'WASH',
    createdAt: -110,
    pickupAt: 60,
    items: [{ type: 'towel', quantity: 4, kg: 3 }],
    batches: [
      {
        items: [[0, 3]],
        stages: [sorted(-110, -100), washed('WASH', W6, -95, 45), packed(-25, -5)],
      },
    ],
    readyAt: -5,
  },
  {
    scenario: 'Customer notification failed (not notified alert)',
    customer: ['Daniel Nelson', '0901000022'],
    service: 'WASH_DRY',
    createdAt: -200,
    pickupAt: 30,
    items: [{ type: 'sport', quantity: 6, kg: 4 }],
    batches: [
      {
        items: [[0, 4]],
        stages: [
          sorted(-200, -190),
          washed('WASH', W1, -185, 45),
          washed('DRY', D2, -135, 55),
          packed(-75, -45),
        ],
      },
    ],
    readyAt: -45,
    notifications: [{ status: 'FAILED', at: -40 }],
  },

  // COMPLETED ---------------------------------------------------------------------------------
  {
    scenario: 'Completed on time',
    customer: ['Emily Carter', '0901000023'],
    service: 'WASH_DRY',
    createdAt: -300,
    pickupAt: -30,
    items: [{ type: 'shirt', quantity: 10, kg: 5 }],
    batches: [
      {
        items: [[0, 5]],
        stages: [
          sorted(-300, -290),
          washed('WASH', W2, -285, 50),
          washed('DRY', D2, -230, 55),
          packed(-170, -150),
        ],
      },
    ],
    readyAt: -150,
    completedAt: -148,
    notifications: [{ status: 'SENT', at: -148 }],
    alerts: [
      {
        type: 'MACHINE_FINISHED',
        severity: 'INFO',
        status: 'RESOLVED',
        reason: 'Unloaded from the machine',
        detectedAt: -230,
        resolvedAt: -227,
      },
    ],
  },
  {
    scenario: 'Completed late',
    customer: ['Samuel Mitchell', '0901000024'],
    service: 'WASH',
    createdAt: -360,
    pickupAt: -180,
    items: [{ type: 'jeans', quantity: 5, kg: 7 }],
    batches: [
      {
        items: [[0, 7]],
        stages: [sorted(-360, -350), washed('WASH', W3, -300, 55), packed(-220, -150)],
      },
    ],
    readyAt: -150,
    completedAt: -140,
    notifications: [
      { status: 'FAILED', at: -145 },
      { status: 'SENT', at: -140 },
    ],
    alerts: [
      {
        type: 'LATE_RISK',
        severity: 'WARNING',
        status: 'RESOLVED',
        reason: 'Expected to finish after the customer pickup time',
        detectedAt: -290,
        resolvedAt: -140,
      },
    ],
  },
  {
    scenario: 'Completed yesterday',
    customer: ['Grace Turner', '0901000025'],
    service: 'WASH_DRY',
    createdAt: -DAY - 300,
    pickupAt: -DAY - 60,
    items: [{ type: 'light', quantity: 6, kg: 3.5 }],
    batches: [
      {
        items: [[0, 3.5]],
        stages: [
          sorted(-DAY - 300, -DAY - 290),
          washed('WASH', W1, -DAY - 285, 45),
          washed('DRY', D1, -DAY - 235, 50),
          packed(-DAY - 180, -DAY - 165),
        ],
      },
    ],
    readyAt: -DAY - 165,
    completedAt: -DAY - 160,
    notifications: [{ status: 'SENT', at: -DAY - 160 }],
  },
]

// On-time set (`--on-time`): every order covers a workflow state, but no stage is late or close
// to late, every ETA is before its pickup, and nothing waits long enough to raise an alert.
const onTimeOrders: OrderSpec[] = [
  {
    scenario: 'Just received, sorting',
    customer: ['Oliver Parker', '0902000001'],
    service: 'WASH_DRY',
    createdAt: -2,
    pickupAt: 240,
    items: [{ type: 'shirt', quantity: 6, kg: 3 }],
    batches: [
      {
        items: [[0, 3]],
        stages: [
          sorting(-2, 15),
          planned('WASH', 20, 70, W6),
          planned('DRY', 75, 120, D4),
          planned('PACKING', 120, 135),
        ],
      },
    ],
  },
  {
    scenario: 'One heavy item split into 2 batches',
    customer: ['Chloe Evans', '0902000002'],
    service: 'WASH_DRY',
    createdAt: -3,
    pickupAt: 300,
    items: [{ type: 'blanket', quantity: 3, kg: 18, note: 'Large comforter' }],
    batches: [
      {
        items: [[0, 10]],
        stages: [
          sorting(-3, 15),
          planned('WASH', 40, 90, W2),
          planned('DRY', 95, 150, D2),
          planned('PACKING', 150, 165),
        ],
      },
      {
        items: [[0, 8]],
        stages: [
          sorting(-3, 15),
          planned('WASH', 45, 90, W1),
          planned('DRY', 95, 145, D1),
          planned('PACKING', 145, 160),
        ],
      },
    ],
  },
  {
    scenario: 'Several items of one group merged into 1 batch',
    customer: ['Ryan Collins', '0902000003'],
    service: 'WASH',
    createdAt: -4,
    pickupAt: 240,
    items: [
      { type: 'shirt', quantity: 4, kg: 2 },
      { type: 'white', quantity: 3, kg: 1.5, note: 'Whites' },
    ],
    batches: [
      {
        items: [
          [0, 2],
          [1, 1.5],
        ],
        stages: [sorting(-4, 20), planned('WASH', 30, 85, W3), planned('PACKING', 85, 100)],
      },
    ],
  },
  {
    scenario: 'Sorted, waiting for its machine slot',
    customer: ['Zoe Edwards', '0902000004'],
    service: 'WASH_DRY',
    createdAt: -20,
    pickupAt: 260,
    items: [{ type: 'towel', quantity: 10, kg: 5 }],
    batches: [
      {
        items: [[0, 5]],
        stages: [
          sorted(-20, -10),
          planned('WASH', 25, 85, W5),
          planned('DRY', 90, 150, D3),
          planned('PACKING', 150, 165),
        ],
      },
    ],
  },
  {
    scenario: 'Dry-only service, dryer slot later',
    customer: ['Nathan Stewart', '0902000005'],
    service: 'DRY',
    createdAt: -15,
    pickupAt: 180,
    items: [{ type: 'blanket', quantity: 1, kg: 3, note: 'Dry only' }],
    batches: [
      {
        items: [[0, 3]],
        stages: [sorted(-15, -5), planned('DRY', 30, 75, D4), planned('PACKING', 75, 90)],
      },
    ],
  },
  {
    scenario: 'Washing',
    customer: ['Lily Morris', '0902000006'],
    service: 'WASH_DRY',
    createdAt: -30,
    pickupAt: 200,
    items: [{ type: 'sport', quantity: 5, kg: 3.5 }],
    batches: [
      {
        items: [[0, 3.5]],
        stages: [
          sorted(-30, -20),
          running('WASH', W1, -10, 45),
          planned('DRY', 40, 90, D1),
          planned('PACKING', 90, 105),
        ],
      },
    ],
  },
  {
    scenario: 'Washed, just finished (unload now)',
    customer: ['Dylan Rogers', '0902000007'],
    service: 'WASH_DRY',
    createdAt: -70,
    pickupAt: 200,
    items: [{ type: 'color', quantity: 9, kg: 4.5 }],
    batches: [
      {
        items: [[0, 4.5]],
        stages: [
          sorted(-70, -60),
          // Planned window includes unloading, so the alert scan does not flag it as late.
          { ...waitingUnload('WASH', W2, -52, 50), end: 10 },
          planned('DRY', 12, 67, D2),
          planned('PACKING', 67, 82),
        ],
      },
    ],
  },
  {
    scenario: 'Drying',
    customer: ['Hannah Reed', '0902000008'],
    service: 'WASH_DRY',
    createdAt: -110,
    pickupAt: 150,
    items: [{ type: 'dark', quantity: 10, kg: 5 }],
    batches: [
      {
        items: [[0, 5]],
        stages: [
          sorted(-110, -100),
          unloaded('WASH', W5, -95, 60),
          running('DRY', D3, -20, 60),
          planned('PACKING', 40, 55),
        ],
      },
    ],
  },
  {
    scenario: 'Pickup tomorrow',
    customer: ['Owen Cook', '0902000009'],
    service: 'WASH_DRY',
    createdAt: -10,
    pickupAt: DAY + 120,
    items: [{ type: 'black', quantity: 6, kg: 4 }],
    batches: [
      {
        items: [[0, 4]],
        stages: [
          sorted(-10, 0),
          planned('WASH', 180, 230, W2),
          planned('DRY', 235, 290, D2),
          planned('PACKING', 290, 305),
        ],
      },
    ],
  },
  {
    scenario: 'Washed and dried, packing',
    customer: ['Ella Morgan', '0902000010'],
    service: 'WASH_DRY',
    createdAt: -150,
    pickupAt: 90,
    items: [{ type: 'shirt', quantity: 8, kg: 4 }],
    batches: [
      {
        items: [[0, 4]],
        stages: [
          sorted(-150, -140),
          unloaded('WASH', W3, -135, 55),
          unloaded('DRY', D1, -75, 50),
          planned('PACKING', -20, 25),
        ],
      },
    ],
  },
  {
    scenario: 'Ready, customer to be notified',
    customer: ['Caleb Bell', '0902000011'],
    service: 'WASH',
    createdAt: -100,
    pickupAt: 60,
    items: [{ type: 'towel', quantity: 4, kg: 3 }],
    batches: [
      {
        items: [[0, 3]],
        stages: [sorted(-100, -90), unloaded('WASH', W6, -85, 45), packed(-25, -5)],
      },
    ],
    readyAt: -5,
  },
  {
    scenario: 'Completed on time',
    customer: ['Aria Murphy', '0902000012'],
    service: 'WASH_DRY',
    createdAt: -300,
    pickupAt: -30,
    items: [{ type: 'light', quantity: 6, kg: 3.5 }],
    batches: [
      {
        items: [[0, 3.5]],
        stages: [
          sorted(-300, -290),
          unloaded('WASH', W1, -285, 45),
          unloaded('DRY', D2, -235, 55),
          packed(-175, -160),
        ],
      },
    ],
    readyAt: -160,
    completedAt: -158,
    notifications: [{ status: 'SENT', at: -158 }],
  },
]

const scenarios = process.argv.includes('--on-time') ? onTimeOrders : orders

// ---- writers ----------------------------------------------------------------------------------

const stageOrder: StageName[] = ['CLASSIFY', 'WASH', 'DRY', 'PACKING']
const serviceRate: Record<ServiceType, number> = { WASH: 25000, DRY: 20000, WASH_DRY: 40000 }

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

// Batch state as the workflow leaves it: the first unfinished stage decides it.
function batchState(stages: StageSpec[]) {
  const next = stages.find((stage) => stage.status !== 'COMPLETED')
  if (!next) return { status: 'COMPLETED' as const, currentStage: null }
  const status =
    next.status === 'IN_PROGRESS'
      ? next.stage === 'WASH'
        ? ('WASHING' as const)
        : ('DRYING' as const)
      : next.status === 'MACHINE_FINISHED'
        ? ('WAITING_FOR_UNLOAD' as const)
        : ('WAITING' as const)
  return { status, currentStage: next.stage }
}

// Projected end of a batch: unfinished work never ends before now (as the rescheduler does).
function batchEta(stages: StageSpec[]) {
  let time = Number.NEGATIVE_INFINITY
  for (const stage of stages) {
    if (stage.status === 'COMPLETED') time = Math.max(time, stage.endedAt ?? stage.end)
    else if (stage.status === 'MACHINE_FINISHED') time = Math.max(time, 0)
    else if (stage.status === 'IN_PROGRESS') time = Math.max(time, 0, stage.end)
    else time = Math.max(time, 0, stage.start) + (stage.end - stage.start)
  }
  return time
}

// Order status follows its stages, like syncOrderStatus; COMPLETED needs a sent notification.
function orderStatus(spec: OrderSpec, stages: StageSpec[]) {
  const done = (stage: StageSpec) => stage.status === 'COMPLETED'
  if (stages.every(done)) return spec.completedAt !== undefined ? 'COMPLETED' : 'READY'
  if (stages.filter((stage) => stage.stage !== 'PACKING').every(done)) return 'FOLDING_PACKING'
  if (stages.filter((stage) => stage.stage === 'CLASSIFY').every(done)) return 'WAITING'
  return 'RECEIVED'
}

async function seedOrder(spec: OrderSpec, machineIds: Map<string, number>) {
  for (const batch of spec.batches)
    batch.stages.sort((a, b) => stageOrder.indexOf(a.stage) - stageOrder.indexOf(b.stage))
  const stages = spec.batches.flatMap((batch) => batch.stages)
  const status = orderStatus(spec, stages)
  const totalKg = spec.items.reduce((sum, item) => sum + item.kg, 0)
  const lastEnd = (stage: StageName) =>
    Math.max(...stages.filter((s) => s.stage === stage).map((s) => s.endedAt ?? s.end))
  const etas = spec.batches.map((batch) => batchEta(batch.stages))
  const orderEta =
    status === 'READY' || status === 'COMPLETED' ? (spec.readyAt ?? 0) : Math.max(...etas)

  const customer = await prisma.customer.create({
    data: { name: spec.customer[0], phone: spec.customer[1], createdAt: at(spec.createdAt) },
  })
  const order = await prisma.laundryOrder.create({
    data: {
      customerId: customer.customerId,
      serviceType: spec.service,
      status,
      totalWeightKg: new Prisma.Decimal(totalKg),
      totalAmount: new Prisma.Decimal(totalKg * serviceRate[spec.service]),
      pickupAt: at(spec.pickupAt),
      estimatedAt: at(orderEta),
      priority: spec.priority ?? 0,
      specialNote: spec.scenario,
      createdAt: at(spec.createdAt),
      ...(status !== 'RECEIVED' ? { classifiedAt: at(lastEnd('CLASSIFY')) } : {}),
      ...(status === 'READY' || status === 'COMPLETED'
        ? {
            packingCompletedAt: at(lastEnd('PACKING')),
            readyAt: at(spec.readyAt ?? lastEnd('PACKING')),
          }
        : {}),
      ...(spec.completedAt !== undefined ? { completedAt: at(spec.completedAt) } : {}),
    },
  })

  const items = []
  for (const item of spec.items)
    items.push(
      await prisma.orderItem.create({
        data: {
          orderId: order.orderId,
          itemType: item.type,
          quantity: item.quantity,
          weightKg: new Prisma.Decimal(item.kg),
          note: item.note ?? null,
        },
      }),
    )

  for (const [index, batchSpec] of spec.batches.entries()) {
    const state = batchState(batchSpec.stages)
    const weightKg = batchSpec.items.reduce((sum, [, kg]) => sum + kg, 0)
    // A batch waiting for a machine has been waiting since its previous stage ended
    // (the forgotten-waiting alert measures from the batch's last update).
    const previousEnd = batchSpec.stages
      .filter((stage) => stage.status === 'COMPLETED')
      .map((stage) => stage.endedAt ?? stage.end)
      .at(-1)
    const batch = await prisma.orderBatch.create({
      data: {
        orderId: order.orderId,
        batchNo: index + 1,
        weightKg: new Prisma.Decimal(weightKg),
        status: state.status,
        currentStage: state.currentStage,
        estimatedAt: at(etas[index]!),
        createdAt: at(spec.createdAt),
        updatedAt: at(previousEnd ?? spec.createdAt),
        ...(state.status === 'COMPLETED' ? { completedAt: at(lastEnd('PACKING')) } : {}),
      },
    })
    for (const [itemIndex, kg] of batchSpec.items)
      await prisma.batchItem.create({
        data: {
          batchId: batch.batchId,
          orderItemId: items[itemIndex]!.orderItemId,
          weightKg: new Prisma.Decimal(kg),
        },
      })
    for (const stage of batchSpec.stages) {
      const machineId = stage.machine ? machineIds.get(stage.machine) : undefined
      if (stage.machine && machineId === undefined)
        throw new Error(`Unknown machine ${stage.machine}`)
      await prisma.batchStage.create({
        data: {
          batchId: batch.batchId,
          machineId: machineId ?? null,
          stage: stage.stage,
          status: stage.status,
          plannedStartAt: at(stage.start),
          plannedEndAt: at(stage.end),
          actualStartedAt: stage.startedAt !== undefined ? at(stage.startedAt) : null,
          actualMachineFinishedAt: stage.finishedAt !== undefined ? at(stage.finishedAt) : null,
          actualEndedAt: stage.endedAt !== undefined ? at(stage.endedAt) : null,
        },
      })
    }
  }

  for (const notification of spec.notifications ?? [])
    await prisma.notification.create({
      data: {
        orderId: order.orderId,
        type: 'READY_FOR_PICKUP',
        channel: 'SMS',
        status: notification.status,
        content: `Hi ${spec.customer[0]}, your order #${order.orderId} is ready for pickup.`,
        sentAt: notification.status === 'SENT' ? at(notification.at) : null,
        createdAt: at(notification.at),
      },
    })

  for (const appointment of spec.appointments ?? [])
    await prisma.appointmentHistory.create({
      data: {
        orderId: order.orderId,
        oldPickupAt: at(appointment.oldPickupAt),
        newPickupAt: at(spec.pickupAt),
        estimatedAt: at(orderEta),
        reason: appointment.reason,
        createdAt: at(appointment.at),
      },
    })

  for (const alert of spec.alerts ?? [])
    await prisma.alert.create({
      data: {
        orderId: order.orderId,
        type: alert.type,
        severity: alert.severity,
        status: alert.status,
        reason: alert.reason,
        detectedAt: at(alert.detectedAt),
        snoozedUntil: alert.snoozedUntil !== undefined ? at(alert.snoozedUntil) : null,
        resolvedAt: alert.resolvedAt !== undefined ? at(alert.resolvedAt) : null,
      },
    })

  return { orderId: order.orderId, status }
}

async function main() {
  await resetDatabase()

  // A machine is BUSY while a stage runs on it or waits there to be unloaded.
  const occupied = new Set(
    scenarios
      .flatMap((order) => order.batches.flatMap((batch) => batch.stages))
      .filter((stage) => stage.status === 'IN_PROGRESS' || stage.status === 'MACHINE_FINISHED')
      .map((stage) => stage.machine),
  )
  const machineIds = new Map<string, number>()
  for (const spec of machineSpecs) {
    const machine = await prisma.machine.create({
      data: {
        name: spec.name,
        type: spec.type,
        capacityKg: new Prisma.Decimal(spec.capacityKg),
        processingMinutes: spec.processingMinutes,
        status:
          'maintenance' in spec ? 'MAINTENANCE' : occupied.has(spec.name) ? 'BUSY' : 'AVAILABLE',
      },
    })
    machineIds.set(spec.name, machine.machineId)
  }

  const created = []
  for (const spec of scenarios) created.push({ ...(await seedOrder(spec, machineIds)), spec })

  console.log(`Seeded ${machineSpecs.length} machines and ${created.length} orders:`)
  for (const { orderId, status, spec } of created)
    console.log(`  #${String(orderId).padEnd(4)} ${status.padEnd(16)} ${spec.scenario}`)
}

main()
  .then(async () => prisma.$disconnect())
  .catch(async (error) => {
    console.error(error)
    await prisma.$disconnect()
    process.exitCode = 1
  })
