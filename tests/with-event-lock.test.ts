import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db";
import { withEventLock } from "@/lib/rsvp/with-event-lock";

describe("withEventLock", () => {
  const phone = "+15555550201";
  const phoneB = "+15555550202";
  let userAId: string;
  let userBId: string;
  let eventId: string;

  beforeAll(async () => {
    const admin = await prisma.user.create({ data: { phone, displayName: "Admin", role: "admin" } });
    const userB = await prisma.user.create({ data: { phone: phoneB, displayName: "UserB" } });
    userAId = admin.id; // admin also RSVPs as a "member" for test purposes
    userBId = userB.id;

    const event = await prisma.event.create({
      data: {
        title: "Lock Test Night",
        startsAt: new Date(Date.now() + 60 * 60 * 1000),
        endsAt: new Date(Date.now() + 2 * 60 * 60 * 1000),
        timezone: "America/New_York",
        signupOpensAt: new Date(),
        locationRevealPolicy: "always",
        createdBy: admin.id,
      },
    });
    eventId = event.id;
  });

  afterAll(async () => {
    await prisma.rsvp.deleteMany({ where: { eventId } });
    await prisma.event.deleteMany({ where: { id: eventId } });
    await prisma.user.deleteMany({ where: { phone: { in: [phone, phoneB] } } });
  });

  it("serializes two concurrent calls rather than interleaving", async () => {
    async function racyInsert(userId: string) {
      return withEventLock(eventId, async (tx) => {
        const agg = await tx.rsvp.aggregate({ where: { eventId }, _max: { queuePosition: true } });
        // Widen the race window: without the row lock, both calls would
        // read the same max concurrently and compute the same next position.
        await new Promise((resolve) => setTimeout(resolve, 50));
        const queuePosition = (agg._max.queuePosition ?? 0) + 1;
        return tx.rsvp.create({ data: { eventId, userId, queuePosition, status: "active" } });
      });
    }

    const [a, b] = await Promise.all([racyInsert(userAId), racyInsert(userBId)]);
    const positions = [a.queuePosition, b.queuePosition].sort((x, y) => x - y);
    expect(positions).toEqual([1, 2]);
  });

  it("only notifies RSVPs that existed both before and after and changed status", async () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    // Set capacity to 1 after the fact: userA (position 1) going, userB (position 2) waitlisted.
    await prisma.event.update({ where: { id: eventId }, data: { capacity: 1 } });

    const [rsvpA] = await prisma.rsvp.findMany({ where: { eventId, userId: userAId } });

    await withEventLock(eventId, async (tx) => {
      await tx.rsvp.update({ where: { id: rsvpA.id }, data: { status: "canceled", canceledAt: new Date() } });
    });

    const notifyLogs = logSpy.mock.calls.map((args) => String(args[0]));
    // userB should be promoted (waitlist -> going) and notified.
    expect(notifyLogs.some((l) => l.includes(userBId) && l.includes("waitlist -> going"))).toBe(true);
    // userA's own RSVP (now canceled, absent from the "after" snapshot) must not appear.
    expect(notifyLogs.some((l) => l.includes(rsvpA.id))).toBe(false);

    logSpy.mockRestore();
  });
});
