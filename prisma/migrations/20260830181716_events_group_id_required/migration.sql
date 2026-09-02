/*
  Warnings:

  - Made the column `group_id` on table `events` required. This step will fail if there are existing NULL values in that column.

*/
-- DropForeignKey
ALTER TABLE "events" DROP CONSTRAINT "events_group_id_fkey";

-- AlterTable
ALTER TABLE "events" ALTER COLUMN "group_id" SET NOT NULL;

-- AddForeignKey
ALTER TABLE "events" ADD CONSTRAINT "events_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "groups"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
