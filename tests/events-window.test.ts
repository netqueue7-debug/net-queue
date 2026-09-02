import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { createEventSchema, updateEventSchema } from "@/lib/events/schema";
import { listEventsInRange } from "@/lib/events/events";
import { windowStart, windowEnd } from "@/lib/events/window";
import { createTestGroup, deleteTestGroup } from "./helpers/test-group";

const baseBody = {
  groupId: "irrelevant-for-schema-only-tests",
  title: "Test Night",
  endsAt: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(),
  timezone: "America/New_York",
  signupOpensAt: new Date().toISOString(),
  locationRevealPolicy: "always" as const,
};

describe("event scheduling window (schema)", () => {
  it("accepts a startsAt within the window", () => {
    const result = createEventSchema.safeParse({
      ...baseBody,
      startsAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      endsAt: new Date(Date.now() + 26 * 60 * 60 * 1000).toISOString(),
    });
    expect(result.success).toBe(true);
  });

  it("rejects a startsAt more than 12 months out", () => {
    const startsAt = new Date(windowEnd().getTime() + 24 * 60 * 60 * 1000);
    const result = createEventSchema.safeParse({
      ...baseBody,
      startsAt: startsAt.toISOString(),
      endsAt: new Date(startsAt.getTime() + 60 * 60 * 1000).toISOString(),
    });
    expect(result.success).toBe(false);
  });

  it("rejects a startsAt more than 1 month in the past", () => {
    const startsAt = new Date(windowStart().getTime() - 24 * 60 * 60 * 1000);
    const result = createEventSchema.safeParse({
      ...baseBody,
      startsAt: startsAt.toISOString(),
      endsAt: new Date(startsAt.getTime() + 60 * 60 * 1000).toISOString(),
    });
    expect(result.success).toBe(false);
  });

  it("updateEventSchema ignores the window check when startsAt isn't being changed", () => {
    const result = updateEventSchema.safeParse({ title: "Renamed Night" });
    expect(result.success).toBe(true);
  });

  it("updateEventSchema rejects moving startsAt outside the window", () => {
    const startsAt = new Date(windowEnd().getTime() + 24 * 60 * 60 * 1000);
    const result = updateEventSchema.safeParse({ startsAt: startsAt.toISOString() });
    expect(result.success).toBe(false);
  });
});

describe("listEventsInRange", () => {
  const phone = "+15555550700";
  let userId: string;
  let groupId: string;
  const eventIds: string[] = [];

  afterAll(async () => {
    await prisma.event.deleteMany({ where: { id: { in: eventIds } } });
    await deleteTestGroup(groupId);
    await prisma.user.deleteMany({ where: { phone } });
  });

  it("only returns scheduled events whose startsAt falls in [start, end)", async () => {
    const admin = await prisma.user.create({ data: { phone, role: "admin" } });
    userId = admin.id;
    groupId = (await createTestGroup(userId, "listEventsInRange Test Group")).id;

    const inRange = new Date(Date.now() + 10 * 24 * 60 * 60 * 1000);
    const beforeRange = new Date(Date.now() + 1 * 24 * 60 * 60 * 1000);
    const afterRange = new Date(Date.now() + 40 * 24 * 60 * 60 * 1000);

    const [a, b, c, canceled] = await Promise.all([
      prisma.event.create({
        data: {
          groupId,
          title: "In range",
          startsAt: inRange,
          endsAt: new Date(inRange.getTime() + 60 * 60 * 1000),
          timezone: "America/New_York",
          signupOpensAt: new Date(),
          locationRevealPolicy: "always",
          createdBy: userId,
        },
      }),
      prisma.event.create({
        data: {
          groupId,
          title: "Before range",
          startsAt: beforeRange,
          endsAt: new Date(beforeRange.getTime() + 60 * 60 * 1000),
          timezone: "America/New_York",
          signupOpensAt: new Date(),
          locationRevealPolicy: "always",
          createdBy: userId,
        },
      }),
      prisma.event.create({
        data: {
          groupId,
          title: "After range",
          startsAt: afterRange,
          endsAt: new Date(afterRange.getTime() + 60 * 60 * 1000),
          timezone: "America/New_York",
          signupOpensAt: new Date(),
          locationRevealPolicy: "always",
          createdBy: userId,
        },
      }),
      prisma.event.create({
        data: {
          groupId,
          title: "Canceled, in range",
          startsAt: inRange,
          endsAt: new Date(inRange.getTime() + 60 * 60 * 1000),
          timezone: "America/New_York",
          signupOpensAt: new Date(),
          locationRevealPolicy: "always",
          status: "canceled",
          createdBy: userId,
        },
      }),
    ]);
    eventIds.push(a.id, b.id, c.id, canceled.id);

    const rangeStart = new Date(Date.now() + 5 * 24 * 60 * 60 * 1000);
    const rangeEnd = new Date(Date.now() + 15 * 24 * 60 * 60 * 1000);
    const results = await listEventsInRange([groupId], rangeStart, rangeEnd);

    expect(results.map((e) => e.id)).toEqual([a.id]);
  });

  it("returns nothing for an empty groupIds list", async () => {
    const results = await listEventsInRange([], new Date(0), new Date(Date.now() + 365 * 24 * 60 * 60 * 1000));
    expect(results).toEqual([]);
  });
});
