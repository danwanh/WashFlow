import assert from 'node:assert/strict'
import test from 'node:test'
import { buildPlan, type Machine } from './planner.js'

const now = new Date('2026-01-01T08:00:00.000Z')
const machines: Machine[] = [
  {
    machineId: 1,
    type: 'WASHER',
    capacityKg: 10,
    processingMinutes: 20,
    status: 'AVAILABLE',
  },
  {
    machineId: 2,
    type: 'DRYER',
    capacityKg: 10,
    processingMinutes: 15,
    status: 'AVAILABLE',
  },
]

test('keeps WASH_DRY stages ordered and preserves item allocations', () => {
  const result = buildPlan({
    service: 'WASH_DRY',
    now,
    pickupAt: new Date('2026-01-01T10:00:00.000Z'),
    machines,
    items: [
      { index: 1, itemType: 'shirt', quantity: 2, weightKg: 4 },
      { index: 2, itemType: 'light', quantity: 1, weightKg: 3 },
      { index: 3, itemType: 'sport', quantity: 1, weightKg: 2 },
    ],
  })
  assert.equal(result.feasible, true)
  const allocated = result.batches.flatMap((batch) => batch.items)
  assert.equal(
    allocated.reduce((sum, item) => sum + item.weightKg, 0),
    9,
  )
  assert.deepEqual(allocated.map((item) => item.itemIndex).sort(), [1, 2, 3])
  for (const batch of result.batches) {
    assert.deepEqual(
      batch.stages.map((stage) => stage.stage),
      ['CLASSIFY', 'WASH', 'DRY', 'PACKING'],
    )
    assert.equal(batch.stages[0]?.machineId, null)
    assert.equal(batch.stages[3]?.machineId, null)
    for (let index = 1; index < batch.stages.length; index++)
      assert.ok(
        new Date(batch.stages[index]!.plannedStartAt) >=
          new Date(batch.stages[index - 1]!.plannedEndAt),
      )
  }
})

test('rejects an item when no required machine is available', () => {
  const result = buildPlan({
    service: 'WASH',
    now,
    pickupAt: new Date('2026-01-01T10:00:00.000Z'),
    machines: [{ ...machines[0]!, capacityKg: 5, status: 'MAINTENANCE' }],
    items: [{ index: 1, itemType: 'towel', quantity: 1, weightKg: 6 }],
  })
  assert.equal(result.feasible, false)
  assert.deepEqual(result.warnings, ['NO_FEASIBLE_MACHINE'])
  assert.equal(result.batches.length, 0)
})

test('splits an oversized item across machine-feasible batches', () => {
  const result = buildPlan({
    service: 'WASH',
    now,
    pickupAt: new Date('2026-01-01T12:00:00.000Z'),
    machines: [{ ...machines[0]!, capacityKg: 5 }],
    items: [{ index: 1, itemType: 'towel', quantity: 1, weightKg: 12 }],
  })
  assert.equal(result.feasible, true)
  assert.deepEqual(
    result.batches.map((batch) => batch.weightKg),
    [5, 5, 2],
  )
  assert.deepEqual(
    result.batches.flatMap((batch) => batch.items),
    [
      { itemIndex: 1, weightKg: 5 },
      { itemIndex: 1, weightKg: 5 },
      { itemIndex: 1, weightKg: 2 },
    ],
  )
  assert.equal(result.compatibilityGroups[0]?.totalWeightKg, 12)
})

test('uses the smaller washer or dryer capacity for WASH_DRY splits', () => {
  const result = buildPlan({
    service: 'WASH_DRY',
    now,
    pickupAt: new Date('2026-01-01T12:00:00.000Z'),
    machines: [
      { machineId: 1, type: 'WASHER', capacityKg: 5, processingMinutes: 20, status: 'AVAILABLE' },
      { machineId: 2, type: 'DRYER', capacityKg: 10, processingMinutes: 15, status: 'AVAILABLE' },
    ],
    items: [{ index: 1, itemType: 'white', quantity: 1, weightKg: 8 }],
  })
  assert.equal(result.feasible, true)
  assert.deepEqual(
    result.batches.map((batch) => batch.weightKg),
    [5, 3],
  )
  for (const batch of result.batches) {
    assert.deepEqual(
      batch.stages.map((stage) => stage.stage),
      ['CLASSIFY', 'WASH', 'DRY', 'PACKING'],
    )
  }
})

test('keeps whole-item allocations and total weight exact', () => {
  const result = buildPlan({
    service: 'WASH',
    now,
    pickupAt: new Date('2026-01-01T12:00:00.000Z'),
    machines: [{ ...machines[0]!, capacityKg: 3 }],
    items: [
      { index: 1, itemType: 'shirt', quantity: 1, weightKg: 3 },
      { index: 2, itemType: 'shirt', quantity: 1, weightKg: 2 },
    ],
  })
  assert.equal(result.feasible, true)
  assert.equal(result.batches.length, 2)
  assert.equal(
    result.batches.reduce((sum, batch) => sum + batch.weightKg, 0),
    5,
  )
  assert.deepEqual(
    result.batches.flatMap((batch) => batch.items),
    [
      { itemIndex: 1, weightKg: 3 },
      { itemIndex: 2, weightKg: 2 },
    ],
  )
})

test('schedules after an operational busy machine becomes available', () => {
  const busyUntil = new Date('2026-01-01T08:45:00.000Z')
  const result = buildPlan({
    service: 'WASH',
    now,
    pickupAt: new Date('2026-01-01T10:00:00.000Z'),
    machines: [
      {
        ...machines[0]!,
        status: 'BUSY',
        availableAt: busyUntil,
      },
    ],
    items: [{ index: 1, itemType: 'shirt', quantity: 1, weightKg: 2 }],
  })
  assert.equal(result.feasible, true)
  // stages[1] is the wash; the ETA includes 15 minutes of packing after it.
  assert.equal(result.batches[0]?.stages[1]?.plannedStartAt, busyUntil.toISOString())
  assert.equal(result.estimatedAt, '2026-01-01T09:20:00.000Z')
})

test('never puts groups that only share a towel batch together', () => {
  // Towels merge with both white and dark laundry, but white and dark must stay apart.
  const result = buildPlan({
    service: 'WASH_DRY',
    now,
    pickupAt: new Date('2026-01-01T12:00:00.000Z'),
    machines,
    items: [
      { index: 0, itemType: 'towel', quantity: 1, weightKg: 4 },
      { index: 1, itemType: 'shirt', quantity: 1, weightKg: 2 },
      { index: 2, itemType: 'dark', quantity: 1, weightKg: 2 },
    ],
  })
  assert.equal(result.feasible, true)
  for (const batch of result.batches) {
    const indices = batch.items.map((item) => item.itemIndex)
    assert.ok(!(indices.includes(1) && indices.includes(2)))
  }
})

test('merges two groups exactly when the spec merge matrix says Y', () => {
  // spec.md §4.2, one item type per group in the column order of the table.
  const types = [
    'white',
    'light',
    'dark',
    'black',
    'towel',
    'jeans',
    'sport',
    'delicate',
    'special',
  ]
  const matrix = [
    'YYNNYNNNN',
    'YYNNYNNNN',
    'NNYYYYNNN',
    'NNYYYYNNN',
    'YYYYYYNNN',
    'NNYYYYNNN',
    'NNNNNNYNN',
    'NNNNNNNYN',
    'NNNNNNNNY',
  ]
  for (const [row, a] of types.entries())
    for (const [column, b] of types.entries()) {
      const result = buildPlan({
        service: 'WASH',
        now,
        pickupAt: new Date('2026-01-01T12:00:00.000Z'),
        machines,
        items: [
          { index: 0, itemType: a, quantity: 1, weightKg: 1 },
          { index: 1, itemType: b, quantity: 1, weightKg: 1 },
        ],
      })
      assert.equal(result.feasible, true)
      assert.equal(
        result.batches.length === 1,
        matrix[row]![column] === 'Y',
        `${a} + ${b} should ${matrix[row]![column] === 'Y' ? '' : 'not '}merge`,
      )
    }
})
