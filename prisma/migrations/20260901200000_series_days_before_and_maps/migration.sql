-- AlterEnum
BEGIN;
CREATE TYPE "SignupOpensRule_new" AS ENUM ('immediately', 'days_before');
ALTER TABLE "event_series" ALTER COLUMN "signup_opens_rule" TYPE "SignupOpensRule_new" USING ("signup_opens_rule"::text::"SignupOpensRule_new");
ALTER TYPE "SignupOpensRule" RENAME TO "SignupOpensRule_old";
ALTER TYPE "SignupOpensRule_new" RENAME TO "SignupOpensRule";
DROP TYPE "public"."SignupOpensRule_old";
COMMIT;

-- AlterTable
ALTER TABLE "event_series" DROP COLUMN "signup_opens_hours_before",
ADD COLUMN     "apple_maps_url" TEXT,
ADD COLUMN     "google_maps_url" TEXT,
ADD COLUMN     "signup_opens_days_before" INTEGER;
