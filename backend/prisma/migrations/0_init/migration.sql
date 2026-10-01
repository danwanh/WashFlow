-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "ServiceType" AS ENUM ('WASH', 'DRY', 'WASH_DRY');

-- CreateEnum
CREATE TYPE "OrderStatus" AS ENUM ('RECEIVED', 'WAITING', 'FOLDING_PACKING', 'READY', 'COMPLETED');

-- CreateEnum
CREATE TYPE "BatchStatus" AS ENUM ('WAITING', 'WASHING', 'DRYING', 'WAITING_FOR_UNLOAD', 'COMPLETED');

-- CreateEnum
CREATE TYPE "StageStatus" AS ENUM ('PLANNED', 'IN_PROGRESS', 'MACHINE_FINISHED', 'COMPLETED');

-- CreateEnum
CREATE TYPE "MachineType" AS ENUM ('WASHER', 'DRYER');

-- CreateEnum
CREATE TYPE "MachineStatus" AS ENUM ('AVAILABLE', 'BUSY', 'OFFLINE', 'MAINTENANCE');

-- CreateEnum
CREATE TYPE "NotificationStatus" AS ENUM ('SENT', 'FAILED');

-- CreateEnum
CREATE TYPE "AlertStatus" AS ENUM ('OPEN', 'SNOOZED', 'RESOLVED');

-- CreateTable
CREATE TABLE "customers" (
    "customer_id" SERIAL NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "phone" VARCHAR(12) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "customers_pkey" PRIMARY KEY ("customer_id")
);

-- CreateTable
CREATE TABLE "laundry_orders" (
    "order_id" SERIAL NOT NULL,
    "customer_id" INTEGER NOT NULL,
    "service_type" "ServiceType" NOT NULL,
    "status" "OrderStatus" NOT NULL DEFAULT 'RECEIVED',
    "total_weight_kg" DECIMAL(5,2) NOT NULL,
    "total_amount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "pickup_at" TIMESTAMP(3) NOT NULL,
    "estimated_at" TIMESTAMP(3) NOT NULL,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "special_note" TEXT,
    "classified_at" TIMESTAMP(3),
    "packing_completed_at" TIMESTAMP(3),
    "ready_at" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "laundry_orders_pkey" PRIMARY KEY ("order_id")
);

-- CreateTable
CREATE TABLE "order_items" (
    "order_item_id" SERIAL NOT NULL,
    "order_id" INTEGER NOT NULL,
    "item_type" VARCHAR(50) NOT NULL,
    "quantity" INTEGER NOT NULL,
    "weight_kg" DECIMAL(5,2),
    "note" TEXT,

    CONSTRAINT "order_items_pkey" PRIMARY KEY ("order_item_id")
);

-- CreateTable
CREATE TABLE "order_batches" (
    "batch_id" SERIAL NOT NULL,
    "order_id" INTEGER NOT NULL,
    "batch_no" INTEGER NOT NULL,
    "weight_kg" DECIMAL(5,2) NOT NULL,
    "status" "BatchStatus" NOT NULL DEFAULT 'WAITING',
    "current_stage" VARCHAR(20),
    "estimated_at" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "order_batches_pkey" PRIMARY KEY ("batch_id")
);

-- CreateTable
CREATE TABLE "batch_items" (
    "batch_item_id" SERIAL NOT NULL,
    "batch_id" INTEGER NOT NULL,
    "order_item_id" INTEGER NOT NULL,
    "weight_kg" DECIMAL(5,2) NOT NULL,

    CONSTRAINT "batch_items_pkey" PRIMARY KEY ("batch_item_id")
);

-- CreateTable
CREATE TABLE "batch_stages" (
    "batch_stage_id" SERIAL NOT NULL,
    "batch_id" INTEGER NOT NULL,
    "machine_id" INTEGER,
    "stage" VARCHAR(20) NOT NULL,
    "status" "StageStatus" NOT NULL DEFAULT 'PLANNED',
    "planned_start_at" TIMESTAMP(3),
    "planned_end_at" TIMESTAMP(3),
    "actual_started_at" TIMESTAMP(3),
    "actual_machine_finished_at" TIMESTAMP(3),
    "actual_ended_at" TIMESTAMP(3),

    CONSTRAINT "batch_stages_pkey" PRIMARY KEY ("batch_stage_id")
);

-- CreateTable
CREATE TABLE "machines" (
    "machine_id" SERIAL NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "type" "MachineType" NOT NULL,
    "status" "MachineStatus" NOT NULL DEFAULT 'AVAILABLE',
    "capacity_kg" DECIMAL(5,2) NOT NULL,
    "processing_minutes" INTEGER NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "machines_pkey" PRIMARY KEY ("machine_id")
);

-- CreateTable
CREATE TABLE "appointment_history" (
    "appointment_history_id" SERIAL NOT NULL,
    "order_id" INTEGER NOT NULL,
    "old_pickup_at" TIMESTAMP(3) NOT NULL,
    "new_pickup_at" TIMESTAMP(3) NOT NULL,
    "estimated_at" TIMESTAMP(3) NOT NULL,
    "reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "appointment_history_pkey" PRIMARY KEY ("appointment_history_id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "notification_id" SERIAL NOT NULL,
    "order_id" INTEGER NOT NULL,
    "type" VARCHAR(30) NOT NULL,
    "channel" VARCHAR(20) NOT NULL,
    "status" "NotificationStatus" NOT NULL,
    "content" TEXT NOT NULL,
    "sent_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("notification_id")
);

-- CreateTable
CREATE TABLE "alerts" (
    "alert_id" SERIAL NOT NULL,
    "order_id" INTEGER NOT NULL,
    "batch_id" INTEGER,
    "type" VARCHAR(30) NOT NULL,
    "severity" VARCHAR(20) NOT NULL,
    "status" "AlertStatus" NOT NULL DEFAULT 'OPEN',
    "reason" TEXT NOT NULL,
    "detected_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "snoozed_until" TIMESTAMP(3),
    "resolved_at" TIMESTAMP(3),

    CONSTRAINT "alerts_pkey" PRIMARY KEY ("alert_id")
);

-- CreateIndex
CREATE INDEX "laundry_orders_status_pickup_at_idx" ON "laundry_orders"("status", "pickup_at");

-- CreateIndex
CREATE INDEX "laundry_orders_pickup_at_idx" ON "laundry_orders"("pickup_at");

-- CreateIndex
CREATE UNIQUE INDEX "order_batches_order_id_batch_no_key" ON "order_batches"("order_id", "batch_no");

-- CreateIndex
CREATE UNIQUE INDEX "batch_items_batch_id_order_item_id_key" ON "batch_items"("batch_id", "order_item_id");

-- CreateIndex
CREATE INDEX "batch_stages_machine_id_status_idx" ON "batch_stages"("machine_id", "status");

-- CreateIndex
CREATE INDEX "alerts_status_detected_at_idx" ON "alerts"("status", "detected_at");

-- AddForeignKey
ALTER TABLE "laundry_orders" ADD CONSTRAINT "laundry_orders_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("customer_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "laundry_orders"("order_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_batches" ADD CONSTRAINT "order_batches_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "laundry_orders"("order_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "batch_items" ADD CONSTRAINT "batch_items_batch_id_fkey" FOREIGN KEY ("batch_id") REFERENCES "order_batches"("batch_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "batch_items" ADD CONSTRAINT "batch_items_order_item_id_fkey" FOREIGN KEY ("order_item_id") REFERENCES "order_items"("order_item_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "batch_stages" ADD CONSTRAINT "batch_stages_batch_id_fkey" FOREIGN KEY ("batch_id") REFERENCES "order_batches"("batch_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "batch_stages" ADD CONSTRAINT "batch_stages_machine_id_fkey" FOREIGN KEY ("machine_id") REFERENCES "machines"("machine_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appointment_history" ADD CONSTRAINT "appointment_history_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "laundry_orders"("order_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "laundry_orders"("order_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "alerts" ADD CONSTRAINT "alerts_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "laundry_orders"("order_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "alerts" ADD CONSTRAINT "alerts_batch_id_fkey" FOREIGN KEY ("batch_id") REFERENCES "order_batches"("batch_id") ON DELETE SET NULL ON UPDATE CASCADE;
