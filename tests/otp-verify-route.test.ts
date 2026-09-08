import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";

const checkOtp = vi.fn(async () => true);
vi.mock("@/lib/auth/otp", async () => {
  const actual = await vi.importActual<typeof import("@/lib/auth/otp")>("@/lib/auth/otp");
  return { ...actual, checkOtp: (...args: Parameters<typeof checkOtp>) => checkOtp(...args) };
});

const { POST } = await import("@/app/api/auth/otp/verify/route");

function request(body: unknown) {
  return new NextRequest("http://localhost/api/auth/otp/verify", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

describe("POST /api/auth/otp/verify", () => {
  const phone = "+15555550105";

  afterEach(async () => {
    await prisma.user.deleteMany({ where: { phone } });
  });

  it("rejects an incorrect code without creating a session", async () => {
    checkOtp.mockResolvedValueOnce(false);

    const res = await POST(request({ phone, code: "000000", smsConsent: true }));
    expect(res.status).toBe(400);
    expect(res.headers.get("set-cookie")).toBeNull();
  });

  it("rejects a first-time number when SMS consent isn't given, without creating a user", async () => {
    const res = await POST(request({ phone, code: "123456", smsConsent: false }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("consent_required");

    const user = await prisma.user.findUnique({ where: { phone } });
    expect(user).toBeNull();
  });

  it("creates a new user, a session cookie, and reports onboarding is needed", async () => {
    const res = await POST(request({ phone, code: "123456", smsConsent: true }));
    expect(res.status).toBe(200);
    expect(res.headers.get("set-cookie")).toMatch(/^session=/);

    const body = await res.json();
    expect(body.needsOnboarding).toBe(true);

    const user = await prisma.user.findUnique({ where: { phone } });
    expect(user).not.toBeNull();
    expect(user?.displayName).toBeNull();
    expect(user?.smsConsentAt).not.toBeNull();
    expect(user?.smsConsentVersion).toBe(1);
  });

  it("reuses the existing user on a second verify, without re-stamping consent", async () => {
    await POST(request({ phone, code: "123456", smsConsent: true }));
    const before = await prisma.user.findUnique({ where: { phone } });

    await POST(request({ phone, code: "123456", smsConsent: true }));
    const after = await prisma.user.findUnique({ where: { phone } });

    expect(after?.id).toBe(before?.id);
    expect(after?.smsConsentAt).toEqual(before?.smsConsentAt);
  });

  it("logs in a returning consented user without requiring the checkbox again", async () => {
    await prisma.user.create({ data: { phone, smsConsentAt: new Date(), smsConsentVersion: 1 } });

    const res = await POST(request({ phone, code: "123456", smsConsent: false }));
    expect(res.status).toBe(200);
    expect(res.headers.get("set-cookie")).toMatch(/^session=/);
  });

  it("requires the checkbox again for a user who opted out, and clears the opt-out on fresh consent", async () => {
    const optedOutAt = new Date();
    await prisma.user.create({
      data: { phone, smsConsentAt: new Date(0), smsConsentVersion: 1, smsOptedOutAt: optedOutAt },
    });

    const blocked = await POST(request({ phone, code: "123456", smsConsent: false }));
    expect(blocked.status).toBe(400);
    expect((await blocked.json()).error).toBe("consent_required");

    const res = await POST(request({ phone, code: "123456", smsConsent: true }));
    expect(res.status).toBe(200);

    const user = await prisma.user.findUnique({ where: { phone } });
    expect(user?.smsOptedOutAt).toBeNull();
    expect(user?.smsConsentAt?.getTime()).toBeGreaterThan(optedOutAt.getTime());
  });
});
