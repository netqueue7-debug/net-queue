import { afterEach, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { createSession } from "@/lib/auth/session";
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
    const res = await POST(request({ displayName: "Sam" }));
    expect(res.status).toBe(401);
  });

  it("rejects a request with no display name", async () => {
    const user = await prisma.user.create({ data: { phone } });
    const { token } = await createSession(user.id);

    const res = await POST(request({ displayName: "" }, token));
    expect(res.status).toBe(400);
  });

  it("records the display name on success", async () => {
    const user = await prisma.user.create({ data: { phone } });
    const { token } = await createSession(user.id);

    const res = await POST(request({ displayName: "Sam" }, token));
    expect(res.status).toBe(200);

    const updated = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(updated.displayName).toBe("Sam");
  });
});
