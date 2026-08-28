import { afterAll, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { createSession } from "@/lib/auth/session";
import { WAIVER_VERSION } from "@/lib/waivers/content";
import { POST as rsvpRoute } from "@/app/api/events/[id]/rsvp/route";

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

describe("signup-open gating", () => {
  const phone = "+15555550220";
  let userId: string;
  let token: string;
  let eventId: string;

  afterAll(async () => {
    await prisma.rsvp.deleteMany({ where: { userId } });
    await prisma.event.deleteMany({ where: { createdBy: userId } });
    await prisma.user.deleteMany({ where: { phone } });
  });

  it("rejects a request one second before signup opens, accepts one second after", async () => {
    const admin = await prisma.user.create({
      data: { phone, displayName: "Sam", role: "admin", waiverVersion: WAIVER_VERSION, waiverAcceptedAt: new Date() },
    });
    userId = admin.id;
    token = (await createSession(admin.id)).token;

    const signupOpensAt = new Date(Date.now() + 1000);
    const event = await prisma.event.create({
      data: {
        title: "Gating Test Night",
        startsAt: new Date(Date.now() + 60 * 60 * 1000),
        endsAt: new Date(Date.now() + 2 * 60 * 60 * 1000),
        timezone: "America/New_York",
        signupOpensAt,
        locationRevealPolicy: "always",
        createdBy: admin.id,
      },
    });
    eventId = event.id;

    const before = await rsvpRoute(
      new NextRequest(`http://localhost/api/events/${eventId}/rsvp`, {
        method: "POST",
        headers: { cookie: `session=${token}` },
      }),
      { params: Promise.resolve({ id: eventId }) },
    );
    expect(before.status).toBe(403);

    await sleep(1100);

    const after = await rsvpRoute(
      new NextRequest(`http://localhost/api/events/${eventId}/rsvp`, {
        method: "POST",
        headers: { cookie: `session=${token}` },
      }),
      { params: Promise.resolve({ id: eventId }) },
    );
    expect(after.status).toBe(201);
  });

  it("ignores a client-supplied timestamp claiming signup is open", async () => {
    const futureOpensAt = new Date(Date.now() + 60 * 60 * 1000);
    const event = await prisma.event.create({
      data: {
        title: "Gating Test Night 2",
        startsAt: new Date(Date.now() + 2 * 60 * 60 * 1000),
        endsAt: new Date(Date.now() + 3 * 60 * 60 * 1000),
        timezone: "America/New_York",
        signupOpensAt: futureOpensAt,
        locationRevealPolicy: "always",
        createdBy: userId,
      },
    });

    // Route accepts no request body at all for RSVP create — nothing to
    // manipulate — but confirm a spoofed "now" in the body changes nothing.
    const res = await rsvpRoute(
      new NextRequest(`http://localhost/api/events/${event.id}/rsvp`, {
        method: "POST",
        headers: { cookie: `session=${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ now: new Date(Date.now() + 60 * 60 * 1000).toISOString() }),
      }),
      { params: Promise.resolve({ id: event.id }) },
    );
    expect(res.status).toBe(403);

    await prisma.event.delete({ where: { id: event.id } });
  });
});
