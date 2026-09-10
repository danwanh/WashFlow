export type Service = 'WASH' | 'DRY' | 'WASH_DRY'
export type Machine = {
  machineId: number
  type: 'WASHER' | 'DRYER'
  capacityKg: number
  processingMinutes: number
  status: string
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
  items: { itemIndex: number; weightKg: number }[]
  stages: {
    stage: 'WASH' | 'DRY'
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

const typeFor = (stage: string) => (stage === 'WASH' ? 'WASHER' : 'DRYER')
const iso = (date: Date) => date.toISOString()

export function buildPlan(input: {
  items: PlanItem[]
  service: Service
  pickupAt: Date
  now: Date
  machines: Machine[]
}) {
  const sorted = [...input.items].sort((a, b) => b.weightKg - a.weightKg)
  const batches: {
    weightKg: number
    items: { itemIndex: number; weightKg: number }[]
    group: string
  }[] = []
  for (const item of sorted) {
    const group = groups[item.itemType.toLowerCase()] ?? 'SPECIAL'
    let best: (typeof batches)[number] | undefined
    let bestWaste = Number.POSITIVE_INFINITY
    for (const batch of batches) {
      if (!matrix[group]?.[batch.group] && !matrix[batch.group]?.[group])
        continue
      const weight = batch.weightKg + item.weightKg
      const required =
        input.service === 'WASH'
          ? ['WASH']
          : input.service === 'DRY'
            ? ['DRY']
            : ['WASH', 'DRY']
      if (
        required.some(
          (stage) =>
            !input.machines.some(
              (m) => m.type === typeFor(stage) && m.capacityKg >= weight,
            ),
        )
      )
        continue
      const capacity = Math.min(
        ...input.machines
          .filter((m) =>
            required.every((stage) =>
              input.machines.some(
                (x) => x.type === typeFor(stage) && x.capacityKg >= weight,
              ),
            ),
          )
          .map((m) => m.capacityKg),
      )
      const waste = capacity - weight
      if (waste < bestWaste) {
        best = batch
        bestWaste = waste
      }
    }
    if (!best) {
      best = { weightKg: 0, items: [], group }
      batches.push(best)
    }
    best.weightKg += item.weightKg
    best.items.push({ itemIndex: item.index, weightKg: item.weightKg })
  }

  const availability = new Map<number, Date>(
    input.machines.map((m) => [m.machineId, input.now]),
  )
  const planned: PlannedBatch[] = []
  for (let i = 0; i < batches.length; i++) {
    const batch = batches[i]!
    const stages: PlannedBatch['stages'] = []
    const required =
      input.service === 'WASH'
        ? ['WASH']
        : input.service === 'DRY'
          ? ['DRY']
          : ['WASH', 'DRY']
    let ready = input.now
    for (const stage of required) {
      const candidates = input.machines.filter(
        (m) =>
          m.status === 'AVAILABLE' &&
          m.type === typeFor(stage) &&
          m.capacityKg >= batch.weightKg,
      )
      if (!candidates.length)
        return {
          feasible: false,
          earliestFeasiblePickup: null,
          batches: [],
          warnings: ['NO_FEASIBLE_MACHINE'],
        }
      candidates.sort(
        (a, b) =>
          Math.max(ready.getTime(), availability.get(a.machineId)!.getTime()) +
            a.processingMinutes * 60000 -
            (Math.max(
              ready.getTime(),
              availability.get(b.machineId)!.getTime(),
            ) +
              b.processingMinutes * 60000) || a.capacityKg - b.capacityKg,
      )
      const machine = candidates[0]!
      const start = new Date(
        Math.max(
          ready.getTime(),
          availability.get(machine.machineId)!.getTime(),
        ),
      )
      const end = new Date(start.getTime() + machine.processingMinutes * 60000)
      availability.set(machine.machineId, end)
      stages.push({
        stage: stage as 'WASH' | 'DRY',
        machineId: machine.machineId,
        plannedStartAt: iso(start),
        plannedEndAt: iso(end),
      })
      ready = end
    }
    planned.push({
      batchNo: i + 1,
      weightKg: batch.weightKg,
      items: batch.items,
      stages,
    })
  }
  const end = planned.reduce(
    (latest, b) =>
      Math.max(latest, new Date(b.stages.at(-1)!.plannedEndAt).getTime()),
    input.now.getTime(),
  )
  const estimated = new Date(end + 30 * 60000)
  return {
    feasible: estimated <= input.pickupAt,
    earliestFeasiblePickup: iso(estimated),
    estimatedAt: iso(estimated),
    batches: planned,
    warnings: estimated > input.pickupAt ? ['PICKUP_TOO_EARLY'] : [],
  }
}
