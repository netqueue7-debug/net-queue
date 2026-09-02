import { afterAll, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { createSession } from "@/lib/auth/session";
import { createTestGroup, deleteTestGroup, addActiveMembership } from "./helpers/test-group";

const { GET } = await import("@/app/api/events/[id]/ics/route");

function req(url: string, token?: string) {
  return new NextRequest(url, { headers: token ? { cookie: `session=${token}` } : undefined });
}

function call(eventId: string, token?: string) {
  return GET(req(`http://localhost/api/events/${eventId}/ics`, token), { params: Promise.resolve({ id: eventId }) });
}

describe("GET /api/events/:id/ics", () => {
  const adminPhone = "+15555550900";
  const memberPhone = "+15555550901";
  const outsiderPhone = "+15555550902";
  const allPhones = [adminPhone, memberPhone, outsiderPhone];
  const groupIds: string[] = [];
  const eventIds: string[] = [];

  let adminId: string;
  let adminToken: string;
  let memberToken: string;
  let outsiderToken: string;
  let groupId: string;
  let hiddenEventId: string;

  afterAll(async () => {
    await prisma.event.deleteMany({ where: { id: { in: eventIds } } });
    for (const g of groupIds) await deleteTestGroup(g);
    await prisma.user.deleteMany({ where: { phone: { in: allPhones } } });
  });

  it("sets up an admin, a member, an outsider, and a hidden-location event", async () => {
    const admin = await prisma.user.create({ data: { phone: adminPhone } });
    const member = await prisma.user.create({ data: { phone: memberPhone } });
    const outsider = await prisma.user.create({ data: { phone: outsiderPhone } });
    adminId = admin.id;
    adminToken = (await createSession(admin.id)).token;
    memberToken = (await createSession(member.id)).token;
    outsiderToken = (await createSession(outsider.id)).token;

    groupId = (await createTestGroup(adminId, "ICS Route Test Group")).id;
    groupIds.push(groupId);
    await addActiveMembership(groupId, adminId, "admin");
    await addActiveMembership(groupId, member.id, "member");

    const event = await prisma.event.create({
      data: {
        groupId,
        title: "Hidden Location Night",
        description: "Bring your own ball",
        startsAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        endsAt: new Date(Date.now() + 25 * 60 * 60 * 1000),
        timezone: "America/New_York",
        signupOpensAt: new Date(),
        locationRevealPolicy: "hidden",
        generalLocation: "Somewhere in town",
        exactLocation: "123 Secret Court St",
        createdBy: adminId,
      },
    });
    hiddenEventId = event.id;
    eventIds.push(event.id);
  });

  it("rejects an unauthenticated request", async () => {
    const res = await call(hiddenEventId);
    expect(res.status).toBe(401);
  });

  it("404s for a caller with no membership in the event's group", async () => {
    const res = await call(hiddenEventId, outsiderToken);
    expect(res.status).toBe(404);
  });

  it("404s for a nonexistent event id", async () => {
    const res = await call("nonexistent-event-id", memberToken);
    expect(res.status).toBe(404);
  });

  it("returns a downloadable .ics with the right headers for a member", async () => {
    const res = await call(hiddenEventId, memberToken);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/calendar");
    expect(res.headers.get("content-disposition")).toContain("attachment");
    expect(res.headers.get("content-disposition")).toContain(".ics");

    const body = await res.text();
    expect(body).toContain("SUMMARY:Hidden Location Night");
    expect(body).toContain("DESCRIPTION:Bring your own ball");
  });

  it("never includes the exact or general location for a member before a hidden policy's reveal time", async () => {
    const res = await call(hiddenEventId, memberToken);
    const body = await res.text();
    expect(body).not.toContain("123 Secret Court St");
    expect(body).not.toContain("Somewhere in town");
    expect(body).not.toContain("LOCATION:");
  });

  it("includes the exact location for an admin viewer regardless of reveal policy", async () => {
    const res = await call(hiddenEventId, adminToken);
    const body = await res.text();
    expect(body).toContain("LOCATION:123 Secret Court St");
  });
});
