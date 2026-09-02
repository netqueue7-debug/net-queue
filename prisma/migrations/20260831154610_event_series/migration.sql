-- CreateEnum
CREATE TYPE "SignupOpensRule" AS ENUM ('immediately', 'hours_before');

-- CreateTable
CREATE TABLE "event_series" (
    "id" TEXT NOT NULL,
    "group_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "weekdays" INTEGER[],
    "start_time" TEXT NOT NULL,
    "end_time" TEXT NOT NULL,
    "timezone" TEXT NOT NULL,
    "recur_until" TIMESTAMP(3) NOT NULL,
    "signup_opens_rule" "SignupOpensRule" NOT NULL,
    "signup_opens_hours_before" INTEGER,
    "capacity" INTEGER,
    "max_guests_per_rsvp" INTEGER,
    "waiver_required" BOOLEAN NOT NULL DEFAULT false,
    "general_location" TEXT,
    "exact_location" TEXT,
    "location_reveal_policy" "LocationRevealPolicy" NOT NULL,
    "location_reveal_hours" INTEGER,
    "created_by" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "event_series_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "events_series_id_idx" ON "events"("series_id");

-- AddForeignKey
ALTER TABLE "event_series" ADD CONSTRAINT "event_series_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_series" ADD CONSTRAINT "event_series_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "groups"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "events" ADD CONSTRAINT "events_series_id_fkey" FOREIGN KEY ("series_id") REFERENCES "event_series"("id") ON DELETE SET NULL ON UPDATE CASCADE;
