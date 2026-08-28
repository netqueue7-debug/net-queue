import { afterAll, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { createSession } from "@/lib/auth/session";
import { GET as meRoute } from "@/app/api/me/route";
import { GET as adminPingRoute } from "@/app/api/admin/ping/route";

function requestWithCookie(url: string, token?: string) {
  const headers = token ? { cookie: `session=${token}` } : undefined;
  return new NextRequest(url, { headers });
}

describe("session guards", () => {
  const phone = "+15555550103";
  const adminPhone = "+15555550104";

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { phone: { in: [phone, adminPhone] } } });
  });

  it("returns 401 for an unauthenticated request to a guarded endpoint", async () => {
    const res = await meRoute(requestWithCookie("http://localhost/api/me"));
    expect(res.status).toBe(401);
  });

  it("returns 403 for a member hitting an admin endpoint", async () => {
    const user = await prisma.user.create({ data: { phone, displayName: "Member" } });
    const { token } = await createSession(user.id);

    const res = await adminPingRoute(requestWithCookie("http://localhost/api/admin/ping", token));
    expect(res.status).toBe(403);
  });

  it("returns 200 for an admin hitting an admin endpoint", async () => {
    const admin = await prisma.user.create({ data: { phone: adminPhone, displayName: "Admin", role: "admin" } });
    const { token } = await createSession(admin.id);

    const res = await adminPingRoute(requestWithCookie("http://localhost/api/admin/ping", token));
    expect(res.status).toBe(200);
  });
});
