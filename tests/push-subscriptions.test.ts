import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { createSession } from "@/lib/auth/session";
import { POST as subscribeRoute } from "@/app/api/push/subscribe/route";
import { POST as unsubscribeRoute } from "@/app/api/push/unsubscribe/route";

function req(url: string, opts: { method?: string; body?: unknown; token?: string } = {}) {
  return new NextRequest(url, {
    method: opts.method ?? "GET",
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    headers: {
      ...(opts.token ? { cookie: `session=${opts.token}` } : {}),
      ...(opts.body !== undefined ? { "Content-Type": "application/json" } : {}),
    },
  });
}

describe("push subscriptions", () => {
  const phoneA = "+15555550920";
  const phoneB = "+15555550921";
  let userAId: string;
  let userBId: string;
  let tokenA: string;
  let tokenB: string;

  const sub = {
    endpoint: "https://push.example.com/endpoint-a",
    keys: { p256dh: "p256dh-value", auth: "auth-value" },
  };

  beforeAll(async () => {
    const userA = await prisma.user.create({ data: { phone: phoneA } });
    const userB = await prisma.user.create({ data: { phone: phoneB } });
    userAId = userA.id;
    userBId = userB.id;
    tokenA = (await createSession(userAId)).token;
    tokenB = (await createSession(userBId)).token;
  });

  afterAll(async () => {
    await prisma.pushSubscription.deleteMany({ where: { userId: { in: [userAId, userBId] } } });
    await prisma.session.deleteMany({ where: { userId: { in: [userAId, userBId] } } });
    await prisma.user.deleteMany({ where: { id: { in: [userAId, userBId] } } });
  });

  it("returns 401 without a session", async () => {
    const res = await subscribeRoute(req("http://localhost/api/push/subscribe", { method: "POST", body: sub }));
    expect(res.status).toBe(401);
  });

  it("rejects an invalid body", async () => {
    const res = await subscribeRoute(
      req("http://localhost/api/push/subscribe", { method: "POST", body: { endpoint: "not-a-url" }, token: tokenA }),
    );
    expect(res.status).toBe(400);
  });

  it("subscribes, and re-subscribing the same endpoint upserts rather than duplicating", async () => {
    const res1 = await subscribeRoute(req("http://localhost/api/push/subscribe", { method: "POST", body: sub, token: tokenA }));
    expect(res1.status).toBe(200);

    const rows1 = await prisma.pushSubscription.findMany({ where: { endpoint: sub.endpoint } });
    expect(rows1).toHaveLength(1);
    expect(rows1[0].userId).toBe(userAId);

    const res2 = await subscribeRoute(req("http://localhost/api/push/subscribe", { method: "POST", body: sub, token: tokenA }));
    expect(res2.status).toBe(200);

    const rows2 = await prisma.pushSubscription.findMany({ where: { endpoint: sub.endpoint } });
    expect(rows2).toHaveLength(1);
  });

  it("unsubscribe is scoped to the owning user — another user's unsubscribe call for the same endpoint does nothing", async () => {
    const res = await unsubscribeRoute(
      req("http://localhost/api/push/unsubscribe", { method: "POST", body: { endpoint: sub.endpoint }, token: tokenB }),
    );
    expect(res.status).toBe(200); // scoped delete is a no-op, never an error

    const stillThere = await prisma.pushSubscription.findUnique({ where: { endpoint: sub.endpoint } });
    expect(stillThere).not.toBeNull();
  });

  it("unsubscribe removes the subscription for its actual owner", async () => {
    const res = await unsubscribeRoute(
      req("http://localhost/api/push/unsubscribe", { method: "POST", body: { endpoint: sub.endpoint }, token: tokenA }),
    );
    expect(res.status).toBe(200);

    const gone = await prisma.pushSubscription.findUnique({ where: { endpoint: sub.endpoint } });
    expect(gone).toBeNull();
  });
});
