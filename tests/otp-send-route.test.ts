import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";

const sendOtp = vi.fn(async () => {});
vi.mock("@/lib/auth/otp", async () => {
  const actual = await vi.importActual<typeof import("@/lib/auth/otp")>("@/lib/auth/otp");
  return { ...actual, sendOtp: (...args: Parameters<typeof sendOtp>) => sendOtp(...args) };
});

vi.mock("@/lib/auth/turnstile", async () => {
  const actual = await vi.importActual<typeof import("@/lib/auth/turnstile")>("@/lib/auth/turnstile");
  return { ...actual, assertTurnstileTokenValid: async () => {} };
});

const { POST } = await import("@/app/api/auth/otp/send/route");

function request(phone: string) {
  return new NextRequest("http://localhost/api/auth/otp/send", {
    method: "POST",
    body: JSON.stringify({ phone, turnstileToken: "test" }),
  });
}

describe("POST /api/auth/otp/send", () => {
  const phone = "+15555550102";

  beforeEach(() => {
    sendOtp.mockClear();
  });

  afterEach(async () => {
    await prisma.otpSendAttempt.deleteMany({ where: { phone } });
  });

  it("rate-limits after 3 sends for the same phone and stops calling Twilio", async () => {
    for (let i = 0; i < 3; i++) {
      const res = await POST(request(phone));
      expect(res.status).toBe(200);
    }
    expect(sendOtp).toHaveBeenCalledTimes(3);

    const blocked = await POST(request(phone));
    expect(blocked.status).toBe(429);
    expect(sendOtp).toHaveBeenCalledTimes(3);
  });
});
