import { afterAll, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { createSession, requireAdmin, ForbiddenError, UnauthorizedError } from "@/lib/auth/session";

function requestWithCookie(token?: string) {
  const headers = token ? { cookie: `session=${token}` } : undefined;
  return new NextRequest("http://localhost/admin", { headers });
}

// The /admin page itself is a Server Component (its redirect() calls need
// real Next request context — see the earlier `cookies()` probe, which
// showed that only works under actual Next request handling, not a direct
// function call), so this exercises the same `requireAdmin` guard the page
// relies on, the same way `tests/session.test.ts` does for /api/admin/ping.
describe("admin page guard (requireAdmin)", () => {
  const memberPhone = "+15555550107";
  const adminPhone = "+15555550108";

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { phone: { in: [memberPhone, adminPhone] } } });
  });

  it("throws UnauthorizedError with no session", async () => {
    await expect(requireAdmin(requestWithCookie())).rejects.toBeInstanceOf(UnauthorizedError);
  });

  it("throws ForbiddenError for a member's session", async () => {
    const member = await prisma.user.create({ data: { phone: memberPhone, role: "member" } });
    const { token } = await createSession(member.id);

    await expect(requireAdmin(requestWithCookie(token))).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("resolves for the seeded admin's session (mirrors `npm run admin:promote`)", async () => {
    const admin = await prisma.user.upsert({
      where: { phone: adminPhone },
      update: { role: "admin" },
      create: { phone: adminPhone, role: "admin" },
    });
    const { token } = await createSession(admin.id);

    await expect(requireAdmin(requestWithCookie(token))).resolves.toMatchObject({ role: "admin" });
  });
});
