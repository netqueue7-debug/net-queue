-- Remove the platform-level waiver tier. Existing waiver_signatures rows
-- with group_id null (the old platform-waiver acceptances) are kept as
-- historical record; only the live-gating columns on users are dropped.
ALTER TABLE "users" DROP COLUMN "waiver_accepted_at";
ALTER TABLE "users" DROP COLUMN "waiver_version";
