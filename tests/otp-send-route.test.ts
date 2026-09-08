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

function request(phone: string, smsConsent: unknown = true) {
  return new NextRequest("http://localhost/api/auth/otp/send", {
    method: "POST",
    body: JSON.stringify({ phone, turnstileToken: "test", smsConsent }),
  });
}

describe("POST /api/auth/otp/send", () => {
  const phone = "+15555550102";

  beforeEach(() => {
    sendOtp.mockClear();
  });

  afterEach(async () => {
    await prisma.otpSendAttempt.deleteMany({ where: { phone } });
    await prisma.user.deleteMany({ where: { phone } });
  });

  it("rate-limits after 10 sends for the same phone and stops calling Twilio", async () => {
    for (let i = 0; i < 10; i++) {
      const res = await POST(request(phone));
      expect(res.status).toBe(200);
    }
    expect(sendOtp).toHaveBeenCalledTimes(10);

    const blocked = await POST(request(phone));
    expect(blocked.status).toBe(429);
    expect(sendOtp).toHaveBeenCalledTimes(10);
  });

  it("rejects a first-time number when SMS consent isn't given, without calling Twilio", async () => {
    const res = await POST(request(phone, false));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("consent_required");
    expect(sendOtp).not.toHaveBeenCalled();
  });

  it("sends without requiring the consent checkbox for a number with active consent on file, and flags it as an existing account", async () => {
    await prisma.user.create({ data: { phone, smsConsentAt: new Date(), smsConsentVersion: 1 } });

    const res = await POST(request(phone, false));
    expect(res.status).toBe(200);
    expect((await res.json()).hasAccount).toBe(true);
    expect(sendOtp).toHaveBeenCalledTimes(1);
  });

  it("does not flag a brand-new number as an existing account", async () => {
    const res = await POST(request(phone, true));
    expect(res.status).toBe(200);
    expect((await res.json()).hasAccount).toBe(false);
  });

  it("requires consent again for a number that has since opted out via STOP", async () => {
    await prisma.user.create({
      data: { phone, smsConsentAt: new Date(), smsConsentVersion: 1, smsOptedOutAt: new Date() },
    });

    const blocked = await POST(request(phone, false));
    expect(blocked.status).toBe(400);
    expect((await blocked.json()).error).toBe("consent_required");
    expect(sendOtp).not.toHaveBeenCalled();

    const res = await POST(request(phone, true));
    expect(res.status).toBe(200);
    expect(sendOtp).toHaveBeenCalledTimes(1);
  });
});
