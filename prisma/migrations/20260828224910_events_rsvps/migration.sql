-- CreateEnum
CREATE TYPE "EventStatus" AS ENUM ('scheduled', 'canceled');

-- CreateEnum
CREATE TYPE "LocationRevealPolicy" AS ENUM ('always', 'hours_before', 'day_of', 'hidden');

-- CreateEnum
CREATE TYPE "RsvpStatus" AS ENUM ('active', 'canceled');

-- CreateTable
CREATE TABLE "events" (
    "id" TEXT NOT NULL,
    "series_id" TEXT,
    "overridden" BOOLEAN NOT NULL DEFAULT false,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "starts_at" TIMESTAMP(3) NOT NULL,
    "ends_at" TIMESTAMP(3) NOT NULL,
    "timezone" TEXT NOT NULL,
    "capacity" INTEGER,
    "max_guests_per_rsvp" INTEGER,
    "signup_opens_at" TIMESTAMP(3) NOT NULL,
    "general_location" TEXT,
    "exact_location" TEXT,
    "location_reveal_policy" "LocationRevealPolicy" NOT NULL,
    "location_reveal_hours" INTEGER,
    "status" "EventStatus" NOT NULL DEFAULT 'scheduled',
    "created_by" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rsvps" (
    "id" TEXT NOT NULL,
    "event_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "queue_position" INTEGER NOT NULL,
    "status" "RsvpStatus" NOT NULL DEFAULT 'active',
    "canceled_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "rsvps_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "rsvps_event_id_queue_position_idx" ON "rsvps"("event_id", "queue_position");

-- CreateIndex
CREATE INDEX "rsvps_event_id_status_idx" ON "rsvps"("event_id", "status");

-- CreateIndex
CREATE INDEX "rsvps_event_id_user_id_idx" ON "rsvps"("event_id", "user_id");

-- Partial unique index: only one *active* RSVP per (event, user). A user who
-- canceled and re-signed up has multiple rows for the same event, but at
-- most one of them is active at a time. Prisma's schema DSL can't express
-- a WHERE clause, so this is hand-added — see the `Rsvp` model comment.
CREATE UNIQUE INDEX "rsvps_event_id_user_id_active_key" ON "rsvps"("event_id", "user_id") WHERE "status" = 'active';

-- AddForeignKey
ALTER TABLE "event_log" ADD CONSTRAINT "event_log_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "events" ADD CONSTRAINT "events_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rsvps" ADD CONSTRAINT "rsvps_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rsvps" ADD CONSTRAINT "rsvps_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
