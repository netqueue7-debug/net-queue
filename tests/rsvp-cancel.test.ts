import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { createRsvp, cancelRsvp } from "@/lib/rsvp/rsvp";
import { computeDerivedStatuses } from "@/lib/rsvp/seat-math";
import { RsvpNotFoundError } from "@/lib/rsvp/errors";
import { addActiveMembership, createTestGroup, deleteTestGroup } from "./helpers/test-group";

describe("cancelRsvp", () => {
  const phones = ["+15555550240", "+15555550241", "+15555550242", "+15555550243", "+15555550244"];
  let adminId: string;
  let userIds: string[];
  let eventId: string;
  let groupId: string;

  beforeAll(async () => {
    const users = await Promise.all(
      phones.map((phone, i) =>
        prisma.user.create({
          data: {
            phone,
            role: i === 0 ? "admin" : "member",
          },
        }),
      ),
    );
    adminId = users[0].id;
    userIds = users.map((u) => u.id);
    groupId = (await createTestGroup(adminId, "Cancel Promotion Test Group")).id;
    await Promise.all(userIds.map((userId, i) => addActiveMembership(groupId, userId, i === 0 ? "admin" : "member")));

    const event = await prisma.event.create({
      data: {
        groupId,
        title: "Cancel Promotion Test",
        startsAt: new Date(Date.now() + 60 * 60 * 1000),
        endsAt: new Date(Date.now() + 2 * 60 * 60 * 1000),
        timezone: "America/New_York",
        signupOpensAt: new Date(Date.now() - 1000),
        locationRevealPolicy: "always",
        capacity: 2,
        createdBy: adminId,
      },
    });
    eventId = event.id;

    // Sign up all 5 users in order. Capacity 2: [0,1] going, [2,3,4] waitlist.
    for (const userId of userIds) {
      await createRsvp(eventId, userId);
    }
  });

  afterAll(async () => {
    await prisma.notification.deleteMany({ where: { eventId } });
    await prisma.rsvp.deleteMany({ where: { eventId } });
    await prisma.event.deleteMany({ where: { id: eventId } });
    await deleteTestGroup(groupId);
    await prisma.user.deleteMany({ where: { phone: { in: phones } } });
  });

  it("canceling the first going RSVP promotes exactly the first waitlisted party and no one else", async () => {
    await cancelRsvp(eventId, userIds[0]);

    const active = await prisma.rsvp.findMany({ where: { eventId, status: "active" } });
    const statuses = computeDerivedStatuses(
      active.map((r) => ({ id: r.id, queuePosition: r.queuePosition, seats: 1 })),
      2,
    );

    const statusByUser = new Map(active.map((r) => [r.userId, statuses.get(r.id)]));

    expect(statusByUser.get(userIds[0])).toBeUndefined(); // canceled, no longer active
    expect(statusByUser.get(userIds[1])).toBe("going"); // was already going, unaffected
    expect(statusByUser.get(userIds[2])).toBe("going"); // promoted: first in line
    expect(statusByUser.get(userIds[3])).toBe("waitlist"); // NOT promoted
    expect(statusByUser.get(userIds[4])).toBe("waitlist"); // NOT promoted
  });

  it("throws RsvpNotFoundError canceling a user with no active RSVP", async () => {
    await expect(cancelRsvp(eventId, userIds[0])).rejects.toBeInstanceOf(RsvpNotFoundError);
  });

  it("cancellation sets canceled_at and leaves the row (not deleted)", async () => {
    const canceled = await prisma.rsvp.findFirst({ where: { eventId, userId: userIds[0] } });
    expect(canceled?.status).toBe("canceled");
    expect(canceled?.canceledAt).not.toBeNull();
  });
});
