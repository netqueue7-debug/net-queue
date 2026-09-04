-- CreateEnum
CREATE TYPE "GroupUpgradeRequestStatus" AS ENUM ('pending', 'approved', 'denied');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "NotificationType" ADD VALUE 'group_upgrade_requested';
ALTER TYPE "NotificationType" ADD VALUE 'group_upgrade_resolved';

-- CreateTable
CREATE TABLE "group_upgrade_requests" (
    "id" TEXT NOT NULL,
    "group_id" TEXT NOT NULL,
    "requested_by" TEXT NOT NULL,
    "requested_limit" INTEGER,
    "message" TEXT,
    "status" "GroupUpgradeRequestStatus" NOT NULL DEFAULT 'pending',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolved_at" TIMESTAMP(3),
    "resolved_by" TEXT,

    CONSTRAINT "group_upgrade_requests_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "group_upgrade_requests_group_id_status_idx" ON "group_upgrade_requests"("group_id", "status");

-- CreateIndex
CREATE INDEX "group_upgrade_requests_status_created_at_idx" ON "group_upgrade_requests"("status", "created_at");

-- AddForeignKey
ALTER TABLE "group_upgrade_requests" ADD CONSTRAINT "group_upgrade_requests_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "groups"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "group_upgrade_requests" ADD CONSTRAINT "group_upgrade_requests_requested_by_fkey" FOREIGN KEY ("requested_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "group_upgrade_requests" ADD CONSTRAINT "group_upgrade_requests_resolved_by_fkey" FOREIGN KEY ("resolved_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
