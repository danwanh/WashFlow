export type Service = 'WASH' | 'DRY' | 'WASH_DRY'
export type Machine = {
  machineId: number
  type: 'WASHER' | 'DRYER'
  capacityKg: number
  processingMinutes: number
  status: string
  availableAt?: Date
}
export type PlanItem = {
  index: number
  itemType: string
  quantity: number
  weightKg: number
  note?: string | null
}
export type PlannedBatch = {
  batchNo: number
  weightKg: number
  group: string
  items: { itemIndex: number; weightKg: number }[]
  stages: {
    stage: 'CLASSIFY' | 'WASH' | 'DRY' | 'PACKING'
    machineId: number
    plannedStartAt: string
    plannedEndAt: string
  }[]
}

const groups: Record<string, string> = {
  shirt: 'WHITE_NORMAL',
  white: 'WHITE_NORMAL',
  light: 'LIGHT_NORMAL',
  color: 'DARK_NORMAL',
  dark: 'DARK_NORMAL',
  black: 'BLACK_NORMAL',
  towel: 'TOWEL_HEAVY',
  blanket: 'TOWEL_HEAVY',
  jeans: 'JEANS_HEAVY',
  sport: 'SPORT',
  delicate: 'DELICATE',
  special: 'SPECIAL',
}
const matrix: Record<string, Record<string, boolean>> = {
  WHITE_NORMAL: { WHITE_NORMAL: true, LIGHT_NORMAL: true, TOWEL_HEAVY: true },
  LIGHT_NORMAL: { WHITE_NORMAL: true, LIGHT_NORMAL: true, TOWEL_HEAVY: true },
  DARK_NORMAL: {
    DARK_NORMAL: true,
    BLACK_NORMAL: true,
    TOWEL_HEAVY: true,
    JEANS_HEAVY: true,
  },
  BLACK_NORMAL: {
    DARK_NORMAL: true,
    BLACK_NORMAL: true,
    TOWEL_HEAVY: true,
    JEANS_HEAVY: true,
  },
  TOWEL_HEAVY: {
    WHITE_NORMAL: true,
    LIGHT_NORMAL: true,
    DARK_NORMAL: true,
    BLACK_NORMAL: true,
    TOWEL_HEAVY: true,
    JEANS_HEAVY: true,
  },
  JEANS_HEAVY: {
    DARK_NORMAL: true,
    BLACK_NORMAL: true,
    TOWEL_HEAVY: true,
    JEANS_HEAVY: true,
  },
  SPORT: { SPORT: true },
  DELICATE: { DELICATE: true },
  SPECIAL: { SPECIAL: true },
}

type BatchDraft = {
  weightKg: number
  group: string
  items: { itemIndex: number; weightKg: number }[]
}
type Stage = 'WASH' | 'DRY'
type PlanInput = Parameters<typeof buildPlan>[0]
type Evaluation = { plan: PlannedBatch[]; eta: number; unusedCapacity: number }

const ETA_TOLERANCE = 5 * 60_000
const MAX_ITERATIONS = 3
const TOP_K = 10
const CLASSIFY_MINUTES = Number(process.env.CLASSIFY_OFFSET_MINUTES ?? 10)
const PACKING_MINUTES = Number(process.env.PACKING_OFFSET_MINUTES ?? 15)
const iso = (date: Date) => date.toISOString()
const machineStages = (service: Service): Stage[] =>
  service === 'WASH' ? ['WASH'] : service === 'DRY' ? ['DRY'] : ['WASH', 'DRY']
const typeFor = (stage: Stage) => (stage === 'WASH' ? 'WASHER' : 'DRYER')
const canMerge = (a: string, b: string) => Boolean(matrix[a]?.[b] || matrix[b]?.[a])
const availableMachines = (input: PlanInput, stage: Stage) =>
  input.machines.filter(
    (machine) =>
      !['OFFLINE', 'MAINTENANCE'].includes(machine.status) &&
      machine.type === typeFor(stage),
  )

function maxFeasibleCapacity(input: PlanInput): number | null {
  const capacities = machineStages(input.service).map((stage) => {
    const machines = availableMachines(input, stage)
    return machines.length ? Math.max(...machines.map((machine) => machine.capacityKg)) : null
  })
  return capacities.some((capacity) => capacity === null)
    ? null
    : Math.min(...(capacities as number[]))
}

function smallestCapacity(weightKg: number, input: PlanInput): number | null {
  const capacities = machineStages(input.service).map((stage) => {
    const machine = availableMachines(input, stage)
      .filter((candidate) => candidate.capacityKg >= weightKg)
      .sort((a, b) => a.capacityKg - b.capacityKg)[0]
    return machine?.capacityKg
  })
  return capacities.some((capacity) => capacity === undefined)
    ? null
    : Math.min(...(capacities as number[]))
}

function splitOversizedItems(input: PlanInput): PlanItem[] | null {
  const capacity = maxFeasibleCapacity(input)
  if (capacity === null) return null

  return input.items.flatMap((item) => {
    const parts: PlanItem[] = []
    let remaining = item.weightKg
    while (remaining > 0.001) {
      const weightKg = Math.min(capacity, remaining)
      parts.push({ ...item, weightKg })
      remaining -= weightKg
    }
    return parts
  })
}

function cloneBatches(batches: BatchDraft[]): BatchDraft[] {
  return batches.map((batch) => ({
    ...batch,
    items: batch.items.map((item) => ({ ...item })),
  }))
}

function validBatches(batches: BatchDraft[], input: PlanInput): boolean {
  return batches.every((batch) => {
    if (!batch.items.length || smallestCapacity(batch.weightKg, input) === null) return false
    const allocatedWeight = batch.items.reduce((sum, item) => sum + item.weightKg, 0)
    if (Math.abs(allocatedWeight - batch.weightKg) > 0.001) return false
    if (new Set(batch.items.map((item) => item.itemIndex)).size !== batch.items.length) return false
    return (
      batch.items.every((item) => item.weightKg > 0) &&
      batch.items.every((item) =>
        batch.items.every((other) =>
          canMerge(
            groups[
              input.items
                .find((source) => source.index === item.itemIndex)
                ?.itemType.toLowerCase() ?? ''
            ] ?? 'SPECIAL',
            groups[
              input.items
                .find((source) => source.index === other.itemIndex)
                ?.itemType.toLowerCase() ?? ''
            ] ?? 'SPECIAL',
          ),
        ),
      )
    )
  })
}

function bfd(input: PlanInput): BatchDraft[] | null {
  const sorted = [...input.items].sort((a, b) => b.weightKg - a.weightKg || a.index - b.index)
  const batches: BatchDraft[] = []
  for (const item of sorted) {
    const group = groups[item.itemType.toLowerCase()] ?? 'SPECIAL'
    let best: BatchDraft | undefined
    let bestWaste = Number.POSITIVE_INFINITY
    for (const batch of batches) {
      const weight = batch.weightKg + item.weightKg
      if (
        !batch.items.some((batchItem) => batchItem.itemIndex === item.index) &&
        canMerge(group, batch.group) &&
        smallestCapacity(weight, input) !== null
      ) {
        const waste = smallestCapacity(weight, input)! - weight
        if (waste < bestWaste) {
          best = batch
          bestWaste = waste
        }
      }
    }
    if (!best) {
      if (smallestCapacity(item.weightKg, input) === null) return null
      best = { weightKg: 0, items: [], group }
      batches.push(best)
    }
    best.weightKg += item.weightKg
    best.items.push({ itemIndex: item.index, weightKg: item.weightKg })
  }
  return batches
}

function schedule(batches: BatchDraft[], input: PlanInput): Evaluation | null {
  if (!validBatches(batches, input)) return null
  const availability = new Map(
    input.machines
      .filter((machine) => !['OFFLINE', 'MAINTENANCE'].includes(machine.status))
      .map((machine) => [machine.machineId, machine.availableAt?.getTime() ?? input.now.getTime()]),
  )
  const ordered = [...batches].sort(
    (a, b) => b.weightKg - a.weightKg || a.items[0]!.itemIndex - b.items[0]!.itemIndex,
  )
  const planned: PlannedBatch[] = []
  let unusedCapacity = 0
  for (const [batchIndex, batch] of ordered.entries()) {
    const stages: PlannedBatch['stages'] = []
    let ready = input.now.getTime() + CLASSIFY_MINUTES * 60_000
    stages.push({
      stage: 'CLASSIFY',
      machineId: 0,
      plannedStartAt: iso(input.now),
      plannedEndAt: iso(new Date(ready)),
    })
    for (const stage of machineStages(input.service)) {
      const candidates = availableMachines(input, stage).filter(
        (machine) => machine.capacityKg >= batch.weightKg,
      )
      if (!candidates.length) return null
      candidates.sort((a, b) => {
        const finishA =
          Math.max(ready, availability.get(a.machineId)!) + a.processingMinutes * 60_000
        const finishB =
          Math.max(ready, availability.get(b.machineId)!) + b.processingMinutes * 60_000
        return finishA - finishB || a.capacityKg - b.capacityKg || a.machineId - b.machineId
      })
      const machine = candidates[0]!
      const start = Math.max(ready, availability.get(machine.machineId)!)
      const end = start + machine.processingMinutes * 60_000
      availability.set(machine.machineId, end)
      unusedCapacity += machine.capacityKg - batch.weightKg
      stages.push({
        stage,
        machineId: machine.machineId,
        plannedStartAt: iso(new Date(start)),
        plannedEndAt: iso(new Date(end)),
      })
      ready = end
    }
    const packingStart = ready
    const packingEnd = packingStart + PACKING_MINUTES * 60_000
    stages.push({
      stage: 'PACKING',
      machineId: 0,
      plannedStartAt: iso(new Date(packingStart)),
      plannedEndAt: iso(new Date(packingEnd)),
    })
    planned.push({
      batchNo: batchIndex + 1,
      weightKg: batch.weightKg,
      group: batch.group,
      items: batch.items,
      stages,
    })
  }
  const end = planned.reduce(
    (latest, batch) => Math.max(latest, new Date(batch.stages.at(-1)!.plannedEndAt).getTime()),
    input.now.getTime(),
  )
  return { plan: planned, eta: end, unusedCapacity }
}

function neighbors(source: BatchDraft[], input: PlanInput): BatchDraft[][] {
  const result: BatchDraft[][] = []
  const add = (candidate: BatchDraft[]) => {
    if (validBatches(candidate, input)) result.push(candidate)
  }
  for (let from = 0; from < source.length; from++) {
    for (let item = 0; item < source[from]!.items.length; item++) {
      for (let to = 0; to < source.length; to++) {
        if (from === to) continue
        const candidate = cloneBatches(source)
        const moved = candidate[from]!.items.splice(item, 1)[0]!
        candidate[from]!.weightKg -= moved.weightKg
        candidate[to]!.items.push(moved)
        candidate[to]!.weightKg += moved.weightKg
        add(candidate.filter((batch) => batch.items.length > 0))
      }
    }
  }
  for (let left = 0; left < source.length; left++) {
    for (let right = left + 1; right < source.length; right++) {
      const candidate = cloneBatches(source)
      candidate[left]!.items.push(...candidate[right]!.items)
      candidate[left]!.weightKg += candidate[right]!.weightKg
      add(candidate.filter((_, index) => index !== right))
      for (const leftItem of source[left]!.items)
        for (const rightItem of source[right]!.items) {
          const swapped = cloneBatches(source)
          const leftIndex = swapped[left]!.items.findIndex(
            (item) => item.itemIndex === leftItem.itemIndex,
          )
          const rightIndex = swapped[right]!.items.findIndex(
            (item) => item.itemIndex === rightItem.itemIndex,
          )
          swapped[left]!.items[leftIndex] = rightItem
          swapped[right]!.items[rightIndex] = leftItem
          swapped[left]!.weightKg += rightItem.weightKg - leftItem.weightKg
          swapped[right]!.weightKg += leftItem.weightKg - rightItem.weightKg
          add(swapped)
        }
    }
  }
  for (const [index, batch] of source.entries()) {
    if (batch.items.length < 2) continue
    const splitAt = Math.ceil(batch.items.length / 2)
    const first = batch.items.slice(0, splitAt)
    const second = batch.items.slice(splitAt)
    const candidate = cloneBatches(source)
    candidate[index] = {
      ...candidate[index]!,
      items: first,
      weightKg: first.reduce((sum, item) => sum + item.weightKg, 0),
    }
    candidate.splice(index + 1, 0, {
      group: batch.group,
      items: second,
      weightKg: second.reduce((sum, item) => sum + item.weightKg, 0),
    })
    add(candidate)
  }
  return result
}

function better(a: Evaluation, b: Evaluation, input: PlanInput): boolean {
  const etaDifference = Math.abs(a.eta - b.eta)
  if (etaDifference > ETA_TOLERANCE) return a.eta < b.eta
  if (a.plan.length !== b.plan.length) return a.plan.length < b.plan.length
  const aBuffer = input.pickupAt.getTime() - a.eta
  const bBuffer = input.pickupAt.getTime() - b.eta
  if (aBuffer !== bBuffer) return aBuffer > bBuffer
  return a.unusedCapacity < b.unusedCapacity
}

export function buildPlan(input: {
  items: PlanItem[]
  service: Service
  pickupAt: Date
  now: Date
  machines: Machine[]
}) {
  const planningItems = splitOversizedItems(input)
  if (!planningItems)
    return {
      feasible: false,
      earliestFeasiblePickup: null,
      batches: [],
      compatibilityGroups: [],
      warnings: ['NO_FEASIBLE_MACHINE'],
    }
  const planningInput = { ...input, items: planningItems }
  const initial = bfd(planningInput)
  if (!initial)
    return {
      feasible: false,
      earliestFeasiblePickup: null,
      batches: [],
      compatibilityGroups: [],
      warnings: ['NO_FEASIBLE_MACHINE'],
    }
  const initialEvaluation = schedule(initial, planningInput)
  if (!initialEvaluation)
    return {
      feasible: false,
      earliestFeasiblePickup: null,
      batches: [],
      compatibilityGroups: [],
      warnings: ['NO_FEASIBLE_MACHINE'],
    }
  let current: Evaluation = initialEvaluation
  for (let iteration = 0; iteration < MAX_ITERATIONS; iteration++) {
    const evaluated: { candidate: BatchDraft[]; evaluation: Evaluation }[] = neighbors(
      current.plan.map((batch) => ({
        weightKg: batch.weightKg,
        group: batch.group,
        items: batch.items,
      })),
      planningInput,
    )
      .map((candidate) => ({
        candidate,
        evaluation: schedule(candidate, planningInput),
      }))
      .filter(
        (entry): entry is { candidate: BatchDraft[]; evaluation: Evaluation } =>
          entry.evaluation !== null,
      )
      .sort((a, b) =>
        better(a.evaluation, b.evaluation, planningInput)
          ? -1
          : better(b.evaluation, a.evaluation, planningInput)
            ? 1
            : 0,
      )
      .slice(0, TOP_K)
    const best: Evaluation | undefined = evaluated[0]?.evaluation
    if (!best || !better(best, current, planningInput)) break
    current = best
  }
  const estimated = new Date(current.eta)
  return {
    feasible: estimated <= input.pickupAt,
    earliestFeasiblePickup: iso(estimated),
    estimatedAt: iso(estimated),
    batches: current.plan,
    compatibilityGroups: Array.from(
      current.plan
        .reduce((groupsByName, batch) => {
          const existing = groupsByName.get(batch.group)
          if (existing) {
            existing.totalWeightKg += batch.weightKg
            for (const item of batch.items) {
              if (!existing.itemIndices.includes(item.itemIndex))
                existing.itemIndices.push(item.itemIndex)
            }
          } else {
            groupsByName.set(batch.group, {
              group: batch.group,
              itemIndices: [...new Set(batch.items.map((item) => item.itemIndex))],
              totalWeightKg: batch.weightKg,
            })
          }
          return groupsByName
        }, new Map<string, { group: string; itemIndices: number[]; totalWeightKg: number }>())
        .values(),
    ),
    warnings: estimated > input.pickupAt ? ['PICKUP_TOO_EARLY'] : [],
  }
}
