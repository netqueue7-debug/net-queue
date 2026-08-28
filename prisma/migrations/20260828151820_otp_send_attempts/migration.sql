-- CreateTable
CREATE TABLE "otp_send_attempts" (
    "id" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "ip" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "otp_send_attempts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "otp_send_attempts_phone_created_at_idx" ON "otp_send_attempts"("phone", "created_at");

-- CreateIndex
CREATE INDEX "otp_send_attempts_ip_created_at_idx" ON "otp_send_attempts"("ip", "created_at");

-- CreateIndex
CREATE INDEX "otp_send_attempts_created_at_idx" ON "otp_send_attempts"("created_at");
