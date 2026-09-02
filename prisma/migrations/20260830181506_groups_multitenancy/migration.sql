-- CreateEnum
CREATE TYPE "GroupJoinPolicy" AS ENUM ('open', 'approval');

-- CreateEnum
CREATE TYPE "GroupMembershipRole" AS ENUM ('member', 'admin');

-- CreateEnum
CREATE TYPE "GroupMembershipStatus" AS ENUM ('active', 'pending', 'rejected');

-- AlterTable
ALTER TABLE "events" ADD COLUMN     "group_id" TEXT,
ADD COLUMN     "waiver_required" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "waiver_signatures" ADD COLUMN     "group_id" TEXT;

-- CreateTable
CREATE TABLE "groups" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "join_policy" "GroupJoinPolicy" NOT NULL DEFAULT 'open',
    "join_code" TEXT NOT NULL,
    "waiver_content" TEXT,
    "waiver_version" INTEGER,
    "created_by" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "groups_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "group_memberships" (
    "id" TEXT NOT NULL,
    "group_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "role" "GroupMembershipRole" NOT NULL DEFAULT 'member',
    "status" "GroupMembershipStatus" NOT NULL DEFAULT 'pending',
    "group_waiver_accepted_at" TIMESTAMP(3),
    "group_waiver_version_accepted" INTEGER,
    "joined_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "group_memberships_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "groups_join_code_key" ON "groups"("join_code");

-- CreateIndex
CREATE INDEX "group_memberships_group_id_status_idx" ON "group_memberships"("group_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "group_memberships_group_id_user_id_key" ON "group_memberships"("group_id", "user_id");

-- CreateIndex
CREATE INDEX "events_group_id_status_idx" ON "events"("group_id", "status");

-- AddForeignKey
ALTER TABLE "groups" ADD CONSTRAINT "groups_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "group_memberships" ADD CONSTRAINT "group_memberships_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "groups"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "group_memberships" ADD CONSTRAINT "group_memberships_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "waiver_signatures" ADD CONSTRAINT "waiver_signatures_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "groups"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "events" ADD CONSTRAINT "events_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "groups"("id") ON DELETE SET NULL ON UPDATE CASCADE;
