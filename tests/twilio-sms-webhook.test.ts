import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";

const validateRequest = vi.fn((..._args: [string, string, string, Record<string, unknown>]) => true);
vi.mock("twilio", () => ({
  default: Object.assign(vi.fn(), {
    validateRequest: (...args: Parameters<typeof validateRequest>) => validateRequest(...args),
  }),
}));

const { POST } = await import("@/app/api/webhooks/twilio/sms/route");

function request(body: Record<string, string>) {
  return new NextRequest("http://localhost/api/webhooks/twilio/sms", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded", "x-twilio-signature": "sig", host: "localhost" },
    body: new URLSearchParams(body).toString(),
  });
}

describe("POST /api/webhooks/twilio/sms", () => {
  const phone = "+15555550199";

  afterEach(async () => {
    validateRequest.mockReset();
    validateRequest.mockReturnValue(true);
    await prisma.user.deleteMany({ where: { phone } });
  });

  it("rejects a request with an invalid Twilio signature, without touching the DB", async () => {
    validateRequest.mockReturnValue(false);
    await prisma.user.create({ data: { phone, smsConsentAt: new Date(), smsConsentVersion: 1 } });

    const res = await POST(request({ From: phone, Body: "STOP" }));
    expect(res.status).toBe(403);

    const user = await prisma.user.findUnique({ where: { phone } });
    expect(user?.smsOptedOutAt).toBeNull();
  });

  it("marks a user opted out on STOP", async () => {
    await prisma.user.create({ data: { phone, smsConsentAt: new Date(), smsConsentVersion: 1 } });

    const res = await POST(request({ From: phone, Body: "stop" }));
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/xml");

    const user = await prisma.user.findUnique({ where: { phone } });
    expect(user?.smsOptedOutAt).not.toBeNull();
  });

  it("clears the opt-out on START", async () => {
    await prisma.user.create({
      data: { phone, smsConsentAt: new Date(), smsConsentVersion: 1, smsOptedOutAt: new Date() },
    });

    const res = await POST(request({ From: phone, Body: "START" }));
    expect(res.status).toBe(200);

    const user = await prisma.user.findUnique({ where: { phone } });
    expect(user?.smsOptedOutAt).toBeNull();
  });

  it("leaves consent state untouched for HELP or any other reply", async () => {
    await prisma.user.create({ data: { phone, smsConsentAt: new Date(), smsConsentVersion: 1 } });

    const res = await POST(request({ From: phone, Body: "HELP" }));
    expect(res.status).toBe(200);

    const user = await prisma.user.findUnique({ where: { phone } });
    expect(user?.smsOptedOutAt).toBeNull();
  });

  it("is a no-op for a STOP from a number with no account", async () => {
    const res = await POST(request({ From: "+15555550198", Body: "STOP" }));
    expect(res.status).toBe(200);
  });
});
