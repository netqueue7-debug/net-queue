import { prisma } from "@/lib/db";

const PER_PHONE_LIMIT = 3;
const PER_PHONE_WINDOW_MS = 60 * 60 * 1000; // 1 hour

const PER_IP_LIMIT = 10;
const PER_IP_WINDOW_MS = 60 * 60 * 1000; // 1 hour

// Safety valve against slow-drip abuse that never trips Fraud Guard or the
// per-phone/per-IP limits above. Tune based on real usage once deployed.
const GLOBAL_DAILY_CEILING = 300;
const GLOBAL_WINDOW_MS = 24 * 60 * 60 * 1000; // 24 hours

export class RateLimitExceededError extends Error {
  constructor(public readonly reason: "phone" | "ip" | "global") {
    super(`OTP send rate limit exceeded (${reason}).`);
    this.name = "RateLimitExceededError";
  }
}

export async function assertOtpSendAllowed(phone: string, ip: string): Promise<void> {
  const now = Date.now();

  const [phoneCount, ipCount, globalCount] = await Promise.all([
    prisma.otpSendAttempt.count({
      where: { phone, createdAt: { gte: new Date(now - PER_PHONE_WINDOW_MS) } },
    }),
    prisma.otpSendAttempt.count({
      where: { ip, createdAt: { gte: new Date(now - PER_IP_WINDOW_MS) } },
    }),
    prisma.otpSendAttempt.count({
      where: { createdAt: { gte: new Date(now - GLOBAL_WINDOW_MS) } },
    }),
  ]);

  if (globalCount >= GLOBAL_DAILY_CEILING) {
    console.error(
      `[otp-abuse] Global daily OTP send ceiling crossed: ${globalCount}/${GLOBAL_DAILY_CEILING} in the last 24h.`,
    );
    throw new RateLimitExceededError("global");
  }

  if (phoneCount >= PER_PHONE_LIMIT) {
    throw new RateLimitExceededError("phone");
  }

  if (ipCount >= PER_IP_LIMIT) {
    throw new RateLimitExceededError("ip");
  }
}

export async function recordOtpSendAttempt(phone: string, ip: string): Promise<void> {
  await prisma.otpSendAttempt.create({ data: { phone, ip } });
}
