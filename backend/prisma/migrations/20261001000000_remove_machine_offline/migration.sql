-- Machines are either in service (AVAILABLE/BUSY) or under MAINTENANCE; OFFLINE is folded into it.
UPDATE "machines" SET "status" = 'MAINTENANCE' WHERE "status" = 'OFFLINE';

ALTER TYPE "MachineStatus" RENAME TO "MachineStatus_old";
CREATE TYPE "MachineStatus" AS ENUM ('AVAILABLE', 'BUSY', 'MAINTENANCE');
ALTER TABLE "machines" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "machines"
  ALTER COLUMN "status" TYPE "MachineStatus" USING ("status"::text::"MachineStatus");
ALTER TABLE "machines" ALTER COLUMN "status" SET DEFAULT 'AVAILABLE';
DROP TYPE "MachineStatus_old";
