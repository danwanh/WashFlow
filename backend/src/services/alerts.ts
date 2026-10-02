import { prisma } from "./api.js";

const minuteEnv = (name: string, fallback: number) => {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value >= 0 ? value : fallback;
};

const thresholds = () => ({
  waiting: minuteEnv("ALERT_WAITING_THRESHOLD_MINUTES", 30),
  unload: minuteEnv("ALERT_UNLOAD_THRESHOLD_MINUTES", 15),
  packing: minuteEnv("ALERT_PACKING_THRESHOLD_MINUTES", 30),
  ready: minuteEnv("ALERT_READY_THRESHOLD_MINUTES", 30),
});

const stageLabels: Record<string, string> = {
  CLASSIFY: "Sorting",
  WASH: "Washing",
  DRY: "Drying",
  PACKING: "Packing",
};
const stageLabel = (stage: string) => stageLabels[stage] ?? "Stage";

const activeStatuses = { status: { not: "RESOLVED" as const } };

async function syncAlert(
  tx: any,
  input: {
    orderId: number;
    batchId?: number;
    type: string;
    severity: string;
    reason: string;
    active: boolean;
    now: Date;
  },
) {
  const existing = await tx.alert.findFirst({
    where: {
      orderId: input.orderId,
      batchId: input.batchId ?? null,
      type: input.type,
      ...activeStatuses,
    },
  });

  if (!input.active) {
    if (existing)
      return tx.alert.update({
        where: { alertId: existing.alertId },
        data: { status: "RESOLVED", resolvedAt: input.now },
      });
    return null;
  }

  if (!existing)
    return tx.alert.create({
      data: {
        orderId: input.orderId,
        batchId: input.batchId,
        type: input.type,
        severity: input.severity,
        reason: input.reason,
        detectedAt: input.now,
      },
    });

  if (
    existing.status === "SNOOZED" &&
    existing.snoozedUntil &&
    existing.snoozedUntil <= input.now
  )
    return tx.alert.update({
      where: { alertId: existing.alertId },
      data: {
        status: "OPEN",
        snoozedUntil: null,
        resolvedAt: null,
        severity: input.severity,
        reason: input.reason,
      },
    });

  return tx.alert.update({
    where: { alertId: existing.alertId },
    data: { severity: input.severity, reason: input.reason, resolvedAt: null },
  });
}

const ageExceeded = (
  value: Date | null | undefined,
  minutes: number,
  now: Date,
) => Boolean(value && now.getTime() - value.getTime() > minutes * 60_000);

export async function recordMachineFinishedAlert(
  orderId: number,
  batchId: number,
  now = new Date(),
) {
  return syncAlert(prisma, {
    orderId,
    batchId,
    type: "MACHINE_FINISHED",
    severity: "INFO",
    reason: "Machine finished, needs unloading",
    active: true,
    now,
  });
}

export async function resolveMachineFinishedAlert(
  orderId: number,
  batchId: number,
  now = new Date(),
) {
  return syncAlert(prisma, {
    orderId,
    batchId,
    type: "MACHINE_FINISHED",
    severity: "INFO",
    reason: "Unloaded from the machine",
    active: false,
    now,
  });
}

export async function scanAlerts(now = new Date()) {
  const config = thresholds();
  return prisma.$transaction(async (tx) => {
    const orders = await tx.laundryOrder.findMany({
      where: { status: { not: "COMPLETED" } },
      include: {
        batches: { include: { stages: true } },
        notifications: true,
      },
    });
    const changed: any[] = [];

    for (const order of orders) {
      const late =
        Math.max(order.estimatedAt.getTime(), now.getTime()) >
        order.pickupAt.getTime();
      const lateAlert = await syncAlert(tx, {
        orderId: order.orderId,
        type: "LATE_RISK",
        severity: late ? "WARNING" : "INFO",
        reason: late
          ? "Expected to finish after the customer pickup time"
          : "Order is back on time for pickup",
        active: late,
        now,
      });
      if (lateAlert) changed.push(lateAlert);

      for (const batch of order.batches) {
        for (const stage of batch.stages) {
          const end = stage.plannedEndAt?.getTime();
          if (!end || stage.status === 'COMPLETED') continue;
          const remaining = Math.ceil((end - now.getTime()) / 60000);
          const stageAlert = await syncAlert(tx, {
            orderId: order.orderId,
            batchId: batch.batchId,
            type: remaining < 0 ? 'STAGE_LATE' : 'STAGE_APPROACHING',
            severity: remaining < 0 ? 'WARNING' : 'INFO',
            reason: remaining < 0
              ? `${stageLabel(stage.stage)} is ${Math.abs(remaining)} min late`
              : `${stageLabel(stage.stage)} must finish within ${remaining} min`,
            active: remaining < 0 || remaining <= 5,
            now,
          });
          if (stageAlert) changed.push(stageAlert);
        }
      }

      for (const batch of order.batches) {
        const finishedStage = batch.stages.find(
          (stage) => stage.status === "MACHINE_FINISHED",
        );
        const machineAlert = await syncAlert(tx, {
          orderId: order.orderId,
          batchId: batch.batchId,
          type: "MACHINE_FINISHED",
          severity: "INFO",
          reason: "Machine finished, needs unloading",
          active: Boolean(finishedStage),
          now,
        });
        if (machineAlert) changed.push(machineAlert);

        const waitingSince = batch.updatedAt;
        const waitingAlert = await syncAlert(tx, {
          orderId: order.orderId,
          batchId: batch.batchId,
          type: "FORGOTTEN_WAITING",
          severity: "WARNING",
          reason: "Batch has been waiting for a machine too long",
          active:
            batch.status === "WAITING" &&
            ["WASH", "DRY"].includes(batch.currentStage ?? "") &&
            ageExceeded(waitingSince, config.waiting, now),
          now,
        });
        if (waitingAlert) changed.push(waitingAlert);

        const unloadAlert = await syncAlert(tx, {
          orderId: order.orderId,
          batchId: batch.batchId,
          type: "FORGOTTEN_UNLOAD",
          severity: "CRITICAL",
          reason: "Batch finished but has not been unloaded",
          active:
            batch.status === "WAITING_FOR_UNLOAD" &&
            ageExceeded(
              finishedStage?.actualMachineFinishedAt,
              config.unload,
              now,
            ),
          now,
        });
        if (unloadAlert) changed.push(unloadAlert);
      }

      // Packing becomes due once the last machine stage has been unloaded.
      const lastCompletedAt = order.batches
        .flatMap((batch) => batch.stages)
        .filter((stage) => stage.stage === "WASH" || stage.stage === "DRY")
        .reduce<Date | null>((latest, stage) => {
          if (!stage.actualEndedAt || (latest && latest >= stage.actualEndedAt))
            return latest;
          return stage.actualEndedAt;
        }, null);
      const packingAlert = await syncAlert(tx, {
        orderId: order.orderId,
        type: "FORGOTTEN_PACKING",
        severity: "WARNING",
        reason: "Order has been waiting to be packed too long",
        active:
          order.status === "FOLDING_PACKING" &&
          ageExceeded(lastCompletedAt ?? order.updatedAt, config.packing, now),
        now,
      });
      if (packingAlert) changed.push(packingAlert);

      const notificationSent = order.notifications.some(
        (notification) =>
          notification.type === "READY_FOR_PICKUP" &&
          notification.status === "SENT",
      );
      const readyAlert = await syncAlert(tx, {
        orderId: order.orderId,
        type: "FORGOTTEN_NOTIFICATION",
        severity: "WARNING",
        reason: "Order is ready but the customer has not been notified",
        active:
          order.status === "READY" &&
          !notificationSent &&
          ageExceeded(order.readyAt ?? order.updatedAt, config.ready, now),
        now,
      });
      if (readyAlert) changed.push(readyAlert);
    }

    return { scannedAt: now.toISOString(), changed };
  });
}
