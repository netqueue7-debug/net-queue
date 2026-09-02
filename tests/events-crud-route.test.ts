import { afterAll, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { createSession } from "@/lib/auth/session";
import { createTestGroup, deleteTestGroup } from "./helpers/test-group";
import { GET as listRoute, POST as createRoute } from "@/app/api/events/route";
import { DELETE as deleteRoute, GET as getRoute, PATCH as patchRoute } from "@/app/api/events/[id]/route";

function req(url: string, opts: { method?: string; body?: unknown; token?: string } = {}) {
  return new NextRequest(url, {
    method: opts.method ?? "GET",
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    headers: opts.token ? { cookie: `session=${opts.token}` } : undefined,
  });
}

const baseEventBody = {
  title: "Tuesday Volleyball",
  startsAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
  endsAt: new Date(Date.now() + 26 * 60 * 60 * 1000).toISOString(),
  timezone: "America/New_York",
  signupOpensAt: new Date().toISOString(),
  locationRevealPolicy: "always",
};

describe("admin single-event CRUD", () => {
  const adminPhone = "+15555550210";
  const memberPhone = "+15555550211";
  let adminToken: string;
  let memberToken: string;
  let groupId: string;
  let eventId: string;
  let validEventBody: typeof baseEventBody & { groupId: string };

  afterAll(async () => {
    if (eventId) await prisma.event.deleteMany({ where: { id: eventId } });
    if (groupId) await deleteTestGroup(groupId);
    await prisma.user.deleteMany({ where: { phone: { in: [adminPhone, memberPhone] } } });
  });

  it("sets up an admin and a member", async () => {
    const admin = await prisma.user.create({ data: { phone: adminPhone, role: "admin" } });
    const member = await prisma.user.create({ data: { phone: memberPhone, role: "member" } });
    adminToken = (await createSession(admin.id)).token;
    memberToken = (await createSession(member.id)).token;

    const group = await createTestGroup(admin.id, "Events CRUD Test Group");
    groupId = group.id;
    await prisma.groupMembership.create({
      data: { groupId, userId: admin.id, role: "admin", status: "active" },
    });
    await prisma.groupMembership.create({
      data: { groupId, userId: member.id, role: "member", status: "active" },
    });
    validEventBody = { ...baseEventBody, groupId };
  });

  it("a member cannot create an event", async () => {
    const res = await createRoute(req("http://localhost/api/events", { method: "POST", body: validEventBody, token: memberToken }));
    expect(res.status).toBe(403);
  });

  it("an unauthenticated request cannot create an event", async () => {
    const res = await createRoute(req("http://localhost/api/events", { method: "POST", body: validEventBody }));
    expect(res.status).toBe(401);
  });

  it("admin can create an event", async () => {
    const res = await createRoute(req("http://localhost/api/events", { method: "POST", body: validEventBody, token: adminToken }));
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.event.title).toBe(validEventBody.title);
    expect(body.event.status).toBe("scheduled");
    eventId = body.event.id;
  });

  it("admin sees the created event listed", async () => {
    const res = await listRoute(req("http://localhost/api/events", { token: adminToken }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.events.some((e: { id: string }) => e.id === eventId)).toBe(true);
  });

  it("a member can list and view events (read access is member-facing; write is admin-only)", async () => {
    const listRes = await listRoute(req("http://localhost/api/events", { token: memberToken }));
    expect(listRes.status).toBe(200);

    const getRes = await getRoute(req(`http://localhost/api/events/${eventId}`, { token: memberToken }), {
      params: Promise.resolve({ id: eventId }),
    });
    expect(getRes.status).toBe(200);
  });

  it("a member cannot edit or cancel a specific event", async () => {
    const patchRes = await patchRoute(
      req(`http://localhost/api/events/${eventId}`, { method: "PATCH", body: { title: "Hacked" }, token: memberToken }),
      { params: Promise.resolve({ id: eventId }) },
    );
    expect(patchRes.status).toBe(403);

    const deleteRes = await deleteRoute(req(`http://localhost/api/events/${eventId}`, { method: "DELETE", token: memberToken }), {
      params: Promise.resolve({ id: eventId }),
    });
    expect(deleteRes.status).toBe(403);
  });

  it("admin can edit non-capacity fields", async () => {
    const res = await patchRoute(
      req(`http://localhost/api/events/${eventId}`, { method: "PATCH", body: { title: "Updated Title" }, token: adminToken }),
      { params: Promise.resolve({ id: eventId }) },
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.event.title).toBe("Updated Title");
  });

  it("admin cancel sets status: canceled, does not delete the row", async () => {
    const res = await deleteRoute(req(`http://localhost/api/events/${eventId}`, { method: "DELETE", token: adminToken }), {
      params: Promise.resolve({ id: eventId }),
    });
    expect(res.status).toBe(200);

    const stillThere = await prisma.event.findUnique({ where: { id: eventId } });
    expect(stillThere).not.toBeNull();
    expect(stillThere?.status).toBe("canceled");
  });
});
