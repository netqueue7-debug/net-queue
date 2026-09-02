-- CreateEnum
CREATE TYPE "GuestAddedByRole" AS ENUM ('user', 'admin');

-- CreateEnum
CREATE TYPE "GuestApprovalStatus" AS ENUM ('pending', 'approved', 'rejected', 'removed');

-- CreateTable
CREATE TABLE "guests" (
    "id" TEXT NOT NULL,
    "rsvp_id" TEXT NOT NULL,
    "name" TEXT,
    "added_by_role" "GuestAddedByRole" NOT NULL,
    "approval_status" "GuestApprovalStatus" NOT NULL DEFAULT 'pending',
    "approved_by" TEXT,
    "approved_at" TIMESTAMP(3),
    "waiver_token" TEXT NOT NULL,
    "waiver_signed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "guests_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "guests_waiver_token_key" ON "guests"("waiver_token");

-- CreateIndex
CREATE INDEX "guests_rsvp_id_idx" ON "guests"("rsvp_id");

-- AddForeignKey
ALTER TABLE "waiver_signatures" ADD CONSTRAINT "waiver_signatures_guest_id_fkey" FOREIGN KEY ("guest_id") REFERENCES "guests"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "guests" ADD CONSTRAINT "guests_rsvp_id_fkey" FOREIGN KEY ("rsvp_id") REFERENCES "rsvps"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "guests" ADD CONSTRAINT "guests_approved_by_fkey" FOREIGN KEY ("approved_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
