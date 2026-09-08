-- AlterTable
ALTER TABLE "users" ADD COLUMN     "sms_consent_at" TIMESTAMP(3),
ADD COLUMN     "sms_consent_version" INTEGER;
