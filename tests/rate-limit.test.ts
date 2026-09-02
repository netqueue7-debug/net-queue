import { afterEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { assertOtpSendAllowed, recordOtpSendAttempt, RateLimitExceededError } from "@/lib/auth/rate-limit";

describe("OTP rate limiting", () => {
  const phone = "+15555550101";
  const ip = "203.0.113.10";

  afterEach(async () => {
    await prisma.otpSendAttempt.deleteMany({ where: { OR: [{ phone }, { ip }] } });
  });

  it("allows sends under the per-phone limit and blocks the 11th within the window", async () => {
    for (let i = 0; i < 10; i++) {
      await assertOtpSendAllowed(phone, `198.51.100.${i}`);
      await recordOtpSendAttempt(phone, `198.51.100.${i}`);
    }

    await expect(assertOtpSendAllowed(phone, "198.51.100.99")).rejects.toThrow(RateLimitExceededError);
  });

  it("allows sends under the per-IP limit and blocks the 11th within the window", async () => {
    for (let i = 0; i < 10; i++) {
      const distinctPhone = `+1555555${String(200 + i).padStart(4, "0")}`;
      await assertOtpSendAllowed(distinctPhone, ip);
      await recordOtpSendAttempt(distinctPhone, ip);
    }

    await expect(assertOtpSendAllowed("+15555559999", ip)).rejects.toThrow(RateLimitExceededError);
  });
});
