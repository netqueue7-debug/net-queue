import { afterEach, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { createSession } from "@/lib/auth/session";
import { WAIVER_VERSION } from "@/lib/waivers/content";
import { POST } from "@/app/api/onboarding/complete/route";

function request(body: unknown, token?: string) {
  return new NextRequest("http://localhost/api/onboarding/complete", {
    method: "POST",
    body: JSON.stringify(body),
    headers: token ? { cookie: `session=${token}` } : undefined,
  });
}

describe("POST /api/onboarding/complete", () => {
  const phone = "+15555550106";

  afterEach(async () => {
    await prisma.user.deleteMany({ where: { phone } });
  });

  it("returns 401 without a session", async () => {
    const res = await POST(request({ displayName: "Sam", waiverAccepted: true }));
    expect(res.status).toBe(401);
  });

  it("rejects a request that hasn't accepted the waiver", async () => {
    const user = await prisma.user.create({ data: { phone } });
    const { token } = await createSession(user.id);

    const res = await POST(request({ displayName: "Sam", waiverAccepted: false }, token));
    expect(res.status).toBe(400);
  });

  it("records the display name and a waiver signature on success", async () => {
    const user = await prisma.user.create({ data: { phone } });
    const { token } = await createSession(user.id);

    const res = await POST(request({ displayName: "Sam", waiverAccepted: true }, token));
    expect(res.status).toBe(200);

    const updated = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(updated.displayName).toBe("Sam");
    expect(updated.waiverVersion).toBe(WAIVER_VERSION);
    expect(updated.waiverAcceptedAt).not.toBeNull();

    const signature = await prisma.waiverSignature.findFirst({ where: { userId: user.id } });
    expect(signature?.waiverVersion).toBe(WAIVER_VERSION);
    expect(signature?.signerType).toBe("user");
  });
});
