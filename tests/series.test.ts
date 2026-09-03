import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { createSeries, cancelSeries, cancelSeriesWeekday, updateSeries } from "@/lib/events/series";
import { createRsvp } from "@/lib/rsvp/rsvp";
import { createSession } from "@/lib/auth/session";
import { zonedWeekday } from "@/lib/timezone";
import { computeDerivedStatuses } from "@/lib/rsvp/seat-math";
import { WAIVER_VERSION } from "@/lib/waivers/content";
import { addActiveMembership, createTestGroup, deleteTestGroup } from "./helpers/test-group";
import { PATCH as patchEventRoute } from "@/app/api/events/[id]/route";
import { PATCH as patchSeriesRoute } from "@/app/api/event-series/[id]/route";

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

function localWallClock(instant: Date, timezone: string): string {
  return new Intl.DateTimeFormat("en-US", { timeZone: timezone, hourCycle: "h23", hour: "2-digit", minute: "2-digit" }).format(
    instant,
  );
}

// A short, always-valid recurUntil relative to "now" — every-day tests
// below loop a real DB round-trip (updateEvent/cancelEvent) per materialized
// instance, so keep the window small (a handful of days), not months.
function daysFromNow(days: number, timezone: string): string {
  const instant = new Date(Date.now() + days * 24 * 60 * 60 * 1000);
  return new Intl.DateTimeFormat("en-CA", { timeZone: timezone }).format(instant);
}

// The next upcoming November 30th — always crosses a real US DST change
// (early November) regardless of when this suite runs, without ballooning
// into a multi-year window the way a fixed "+1 year" constant eventually would.
function nextNov30(): string {
  const now = new Date();
  const year = now.getUTCMonth() === 11 || (now.getUTCMonth() === 10 && now.getUTCDate() > 30) ? now.getUTCFullYear() + 1 : now.getUTCFullYear();
  return `${year}-11-30`;
}

describe("event series", () => {
  const adminPhone = "+15555550600";
  const allPhones = [
    adminPhone,
    "+15555550601",
    "+15555550602",
    "+15555550603",
    "+15555550604",
    "+15555550605",
    "+15555550606",
  ];
  let adminId: string;
  let groupId: string;

  beforeAll(async () => {
    const admin = await prisma.user.create({
      data: { phone: adminPhone, role: "admin", waiverVersion: WAIVER_VERSION, waiverAcceptedAt: new Date() },
    });
    adminId = admin.id;
    groupId = (await createTestGroup(adminId, "Series Test Group")).id;
    await addActiveMembership(groupId, adminId, "admin");
  });

  afterAll(async () => {
    const seriesList = await prisma.eventSeries.findMany({ where: { groupId }, select: { id: true } });
    const seriesIds = seriesList.map((s) => s.id);
    await prisma.notification.deleteMany({ where: { event: { seriesId: { in: seriesIds } } } });
    await prisma.rsvp.deleteMany({ where: { event: { seriesId: { in: seriesIds } } } });
    await prisma.eventLog.deleteMany({ where: { event: { seriesId: { in: seriesIds } } } });
    await prisma.event.deleteMany({ where: { seriesId: { in: seriesIds } } });
    await prisma.eventSeries.deleteMany({ where: { id: { in: seriesIds } } });
    await deleteTestGroup(groupId);
    await prisma.user.deleteMany({ where: { phone: { in: allPhones } } });
  });

  it("materializes the correct instances for a Tuesday/Thursday series, correct local times, DST-safe", async () => {
    const { series, eventsCreated } = await createSeries(adminId, {
      groupId,
      title: "Tue/Thu Volleyball",
      description: null,
      weekdays: [2, 4],
      startTime: "19:00",
      endTime: "22:00",
      timezone: "America/New_York",
      recurUntil: nextNov30(),
      signupOpensRule: "immediately",
      signupOpensDaysBefore: null,
      capacity: 10,
      maxGuestsPerRsvp: null,
      waiverRequired: false,
      generalLocation: "Test Gym",
      exactLocation: null,
      googleMapsUrl: null,
      appleMapsUrl: null,
      locationRevealPolicy: "always",
      locationRevealHours: null,
    });

    expect(eventsCreated).toBeGreaterThan(0);

    const instances = await prisma.event.findMany({ where: { seriesId: series.id } });
    expect(instances).toHaveLength(eventsCreated);

    // Every instance is genuinely on a Tuesday or Thursday, in the
    // series' own timezone, at 7:00pm-10:00pm local — including any that
    // cross the November DST change within this window.
    for (const instance of instances) {
      const weekday = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", weekday: "short" }).format(
        instance.startsAt,
      );
      expect(["Tue", "Thu"]).toContain(weekday);
      expect(localWallClock(instance.startsAt, "America/New_York")).toBe("19:00");
      expect(localWallClock(instance.endsAt, "America/New_York")).toBe("22:00");
      expect(instance.groupId).toBe(groupId);
      expect(instance.overridden).toBe(false);
      expect(instance.status).toBe("scheduled");
      // signupOpensRule: immediately — should already be open.
      expect(instance.signupOpensAt.getTime()).toBeLessThanOrEqual(Date.now());
    }
  });

  it("series edit semantics: propagates to future non-overridden instances only", async () => {
    const { series } = await createSeries(adminId, {
      groupId,
      title: "Edit Semantics Series",
      description: null,
      weekdays: [0, 1, 2, 3, 4, 5, 6], // every day, to guarantee several instances fast
      startTime: "18:00",
      endTime: "19:00",
      timezone: "America/New_York",
      recurUntil: daysFromNow(6, "America/New_York"),
      signupOpensRule: "immediately",
      signupOpensDaysBefore: null,
      capacity: 4,
      maxGuestsPerRsvp: null,
      waiverRequired: false,
      generalLocation: null,
      exactLocation: null,
      googleMapsUrl: null,
      appleMapsUrl: null,
      locationRevealPolicy: "always",
      locationRevealHours: null,
    });

    const instances = await prisma.event.findMany({ where: { seriesId: series.id }, orderBy: { startsAt: "asc" } });
    expect(instances.length).toBeGreaterThanOrEqual(3);

    // Simulate a past instance (materialization always starts from "now",
    // so there's nothing naturally in the past yet) to prove it's untouched.
    const pastInstance = instances[0];
    await prisma.event.update({ where: { id: pastInstance.id }, data: { startsAt: new Date(Date.now() - 60_000) } });

    // Hand-edit the second instance's capacity and mark it overridden.
    const overriddenInstance = instances[1];
    await prisma.event.update({ where: { id: overriddenInstance.id }, data: { capacity: 99, overridden: true } });

    const untouchedFutureInstance = instances[2];

    const { updatedCount } = await updateSeries(series.id, { capacity: 7 }, adminId);

    // Exactly the future, non-overridden instances were counted/updated —
    // not the past one, not the overridden one.
    expect(updatedCount).toBe(instances.length - 2);

    const refetched = await prisma.event.findMany({ where: { seriesId: series.id }, orderBy: { startsAt: "asc" } });
    const byId = new Map(refetched.map((e) => [e.id, e]));

    expect(byId.get(pastInstance.id)?.capacity).toBe(4); // untouched — past
    expect(byId.get(overriddenInstance.id)?.capacity).toBe(99); // untouched — overridden
    expect(byId.get(untouchedFutureInstance.id)?.capacity).toBe(7); // propagated
  });

  it("PATCH /api/events/:id marks the edited instance overridden, protecting it from a later series-wide edit", async () => {
    const { series } = await createSeries(adminId, {
      groupId,
      title: "Overridden Flag Series",
      description: null,
      weekdays: [0, 1, 2, 3, 4, 5, 6],
      startTime: "18:00",
      endTime: "19:00",
      timezone: "America/New_York",
      recurUntil: daysFromNow(6, "America/New_York"),
      signupOpensRule: "immediately",
      signupOpensDaysBefore: null,
      capacity: 4,
      maxGuestsPerRsvp: null,
      waiverRequired: false,
      generalLocation: null,
      exactLocation: null,
      googleMapsUrl: null,
      appleMapsUrl: null,
      locationRevealPolicy: "always",
      locationRevealHours: null,
    });

    const instances = await prisma.event.findMany({ where: { seriesId: series.id }, orderBy: { startsAt: "asc" } });
    expect(instances.length).toBeGreaterThanOrEqual(2);
    const target = instances[0];
    const adminToken = (await createSession(adminId)).token;

    // A plain single-instance edit through the real route — not a direct
    // Prisma write like the test above — is the thing that was previously
    // never flipping `overridden` at all (the bug this fix closes).
    const res = await patchEventRoute(
      req(`http://localhost/api/events/${target.id}`, { method: "PATCH", token: adminToken, body: { capacity: 99 } }),
      { params: Promise.resolve({ id: target.id }) },
    );
    expect(res.status).toBe(200);

    const afterEdit = await prisma.event.findUniqueOrThrow({ where: { id: target.id } });
    expect(afterEdit.overridden).toBe(true);
    expect(afterEdit.capacity).toBe(99);

    const { updatedCount } = await updateSeries(series.id, { capacity: 7 }, adminId);
    expect(updatedCount).toBe(instances.length - 1); // every instance except the one just hand-edited

    const stillProtected = await prisma.event.findUniqueOrThrow({ where: { id: target.id } });
    expect(stillProtected.capacity).toBe(99); // untouched by the series edit
  });

  it("PATCH /api/event-series/:id is group-admin-gated and propagates to future instances", async () => {
    const member = await prisma.user.create({
      data: { phone: "+15555550606", waiverVersion: WAIVER_VERSION, waiverAcceptedAt: new Date() },
    });
    await addActiveMembership(groupId, member.id, "member");
    const memberToken = (await createSession(member.id)).token;
    const adminToken = (await createSession(adminId)).token;

    const { series } = await createSeries(adminId, {
      groupId,
      title: "Route-Level Series Edit",
      description: null,
      weekdays: [0, 1, 2, 3, 4, 5, 6],
      startTime: "18:00",
      endTime: "19:00",
      timezone: "America/New_York",
      recurUntil: daysFromNow(6, "America/New_York"),
      signupOpensRule: "immediately",
      signupOpensDaysBefore: null,
      capacity: 4,
      maxGuestsPerRsvp: null,
      waiverRequired: false,
      generalLocation: null,
      exactLocation: null,
      googleMapsUrl: null,
      appleMapsUrl: null,
      locationRevealPolicy: "always",
      locationRevealHours: null,
    });

    const memberAttempt = await patchSeriesRoute(
      req(`http://localhost/api/event-series/${series.id}`, { method: "PATCH", token: memberToken, body: { title: "Hacked" } }),
      { params: Promise.resolve({ id: series.id }) },
    );
    expect(memberAttempt.status).toBe(403);

    const adminAttempt = await patchSeriesRoute(
      req(`http://localhost/api/event-series/${series.id}`, {
        method: "PATCH",
        token: adminToken,
        body: { title: "Renamed via Route" },
      }),
      { params: Promise.resolve({ id: series.id }) },
    );
    expect(adminAttempt.status).toBe(200);
    const body = await adminAttempt.json();
    expect(body.series.title).toBe("Renamed via Route");
    expect(body.updatedCount).toBeGreaterThan(0);

    const instances = await prisma.event.findMany({ where: { seriesId: series.id } });
    expect(instances.every((i) => i.title === "Renamed via Route")).toBe(true);
  });

  it("capacity propagation from a series edit still promotes from the waitlist on affected instances", async () => {
    const memberPhones = ["+15555550601", "+15555550602", "+15555550603"];
    const members = await Promise.all(
      memberPhones.map((phone) =>
        prisma.user.create({ data: { phone, waiverVersion: WAIVER_VERSION, waiverAcceptedAt: new Date() } }),
      ),
    );
    await Promise.all(members.map((m) => addActiveMembership(groupId, m.id)));

    const { series } = await createSeries(adminId, {
      groupId,
      title: "Capacity Propagation Series",
      description: null,
      weekdays: [0, 1, 2, 3, 4, 5, 6],
      startTime: "20:00",
      endTime: "21:00",
      timezone: "America/New_York",
      recurUntil: daysFromNow(3, "America/New_York"),
      signupOpensRule: "immediately",
      signupOpensDaysBefore: null,
      capacity: 2,
      maxGuestsPerRsvp: null,
      waiverRequired: false,
      generalLocation: null,
      exactLocation: null,
      googleMapsUrl: null,
      appleMapsUrl: null,
      locationRevealPolicy: "always",
      locationRevealHours: null,
    });

    const [instance] = await prisma.event.findMany({ where: { seriesId: series.id }, orderBy: { startsAt: "asc" }, take: 1 });

    for (const m of members) await createRsvp(instance.id, m.id); // capacity 2: first 2 going, 3rd waitlisted

    await updateSeries(series.id, { capacity: 3 }, adminId);

    const active = await prisma.rsvp.findMany({ where: { eventId: instance.id, status: "active" } });
    const statuses = computeDerivedStatuses(
      active.map((r) => ({ id: r.id, queuePosition: r.queuePosition, seats: 1 })),
      3,
    );
    expect([...statuses.values()].every((s) => s === "going")).toBe(true); // all 3 promoted
  });

  it("cancellation: cancels every future instance including overridden ones, leaves the past alone, notifies active RSVPs", async () => {
    const memberPhone = "+15555550604";
    const member = await prisma.user.create({
      data: { phone: memberPhone, waiverVersion: WAIVER_VERSION, waiverAcceptedAt: new Date() },
    });
    await addActiveMembership(groupId, member.id);

    const { series } = await createSeries(adminId, {
      groupId,
      title: "Cancellation Series",
      description: null,
      weekdays: [0, 1, 2, 3, 4, 5, 6],
      startTime: "17:00",
      endTime: "18:00",
      timezone: "America/New_York",
      recurUntil: daysFromNow(4, "America/New_York"),
      signupOpensRule: "immediately",
      signupOpensDaysBefore: null,
      capacity: 5,
      maxGuestsPerRsvp: null,
      waiverRequired: false,
      generalLocation: null,
      exactLocation: null,
      googleMapsUrl: null,
      appleMapsUrl: null,
      locationRevealPolicy: "always",
      locationRevealHours: null,
    });

    const instances = await prisma.event.findMany({ where: { seriesId: series.id }, orderBy: { startsAt: "asc" } });
    expect(instances.length).toBeGreaterThanOrEqual(3);

    const pastInstance = instances[0];
    await prisma.event.update({ where: { id: pastInstance.id }, data: { startsAt: new Date(Date.now() - 60_000) } });

    const overriddenInstance = instances[1];
    await prisma.event.update({ where: { id: overriddenInstance.id }, data: { overridden: true } });

    await createRsvp(overriddenInstance.id, member.id);

    const { canceledCount } = await cancelSeries(series.id, adminId);

    expect(canceledCount).toBe(instances.length - 1); // every future instance, including the overridden one

    const refetched = await prisma.event.findMany({ where: { seriesId: series.id } });
    const byId = new Map(refetched.map((e) => [e.id, e]));

    expect(byId.get(pastInstance.id)?.status).toBe("scheduled"); // untouched — past
    expect(byId.get(overriddenInstance.id)?.status).toBe("canceled"); // canceled anyway — overridden doesn't protect from series cancellation

    const notification = await prisma.notification.findFirst({
      where: { eventId: overriddenInstance.id, userId: member.id, type: "event_canceled" },
    });
    expect(notification).not.toBeNull();
  });

  it("cancelSeriesWeekday: cancels only the given weekday's future instances, including overridden ones, and drops it from series.weekdays", async () => {
    const memberPhone = "+15555550605";
    const member = await prisma.user.create({
      data: { phone: memberPhone, waiverVersion: WAIVER_VERSION, waiverAcceptedAt: new Date() },
    });
    await addActiveMembership(groupId, member.id);

    const { series } = await createSeries(adminId, {
      groupId,
      title: "Weekday Cancellation Series",
      description: null,
      weekdays: [2, 4], // Tue, Thu
      startTime: "19:00",
      endTime: "22:00",
      timezone: "America/New_York",
      recurUntil: daysFromNow(21, "America/New_York"),
      signupOpensRule: "immediately",
      signupOpensDaysBefore: null,
      capacity: 10,
      maxGuestsPerRsvp: null,
      waiverRequired: false,
      generalLocation: null,
      exactLocation: null,
      googleMapsUrl: null,
      appleMapsUrl: null,
      locationRevealPolicy: "always",
      locationRevealHours: null,
    });

    const instances = await prisma.event.findMany({ where: { seriesId: series.id }, orderBy: { startsAt: "asc" } });
    const tuesdays = instances.filter((e) => zonedWeekday(e.startsAt, e.timezone) === 2);
    const thursdays = instances.filter((e) => zonedWeekday(e.startsAt, e.timezone) === 4);
    expect(tuesdays.length).toBeGreaterThan(0);
    expect(thursdays.length).toBeGreaterThan(0);

    // Hand-edit one Thursday and RSVP a member to it — cancelSeriesWeekday
    // should cancel it anyway and still notify the RSVP'd member.
    const overriddenThursday = thursdays[0];
    await prisma.event.update({ where: { id: overriddenThursday.id }, data: { overridden: true } });
    await createRsvp(overriddenThursday.id, member.id);

    const { canceledCount } = await cancelSeriesWeekday(series.id, 4, adminId);
    expect(canceledCount).toBe(thursdays.length);

    const refetched = await prisma.event.findMany({ where: { seriesId: series.id } });
    const byId = new Map(refetched.map((e) => [e.id, e]));

    for (const tue of tuesdays) {
      expect(byId.get(tue.id)?.status).toBe("scheduled"); // untouched — different weekday
    }
    for (const thu of thursdays) {
      expect(byId.get(thu.id)?.status).toBe("canceled"); // canceled, including the overridden one
    }

    const notification = await prisma.notification.findFirst({
      where: { eventId: overriddenThursday.id, userId: member.id, type: "event_canceled" },
    });
    expect(notification).not.toBeNull();

    const refetchedSeries = await prisma.eventSeries.findUniqueOrThrow({ where: { id: series.id } });
    expect(refetchedSeries.weekdays).toEqual([2]); // Thursday dropped, Tuesday remains
  });

  it("recurStartsAt controls the earliest materialized instance, not just recurUntil", async () => {
    const timezone = "America/New_York";
    const recurStartsAt = daysFromNow(3, timezone);
    const recurUntil = daysFromNow(6, timezone);

    const { series, eventsCreated } = await createSeries(adminId, {
      groupId,
      title: "Delayed Start Series",
      description: null,
      weekdays: [0, 1, 2, 3, 4, 5, 6], // every day, so the window is fully populated
      startTime: "18:00",
      endTime: "19:00",
      timezone,
      recurStartsAt,
      recurUntil,
      signupOpensRule: "immediately",
      signupOpensDaysBefore: null,
      capacity: 4,
      maxGuestsPerRsvp: null,
      waiverRequired: false,
      generalLocation: null,
      exactLocation: null,
      googleMapsUrl: null,
      appleMapsUrl: null,
      locationRevealPolicy: "always",
      locationRevealHours: null,
    });

    expect(eventsCreated).toBeGreaterThan(0);

    const instances = await prisma.event.findMany({ where: { seriesId: series.id }, orderBy: { startsAt: "asc" } });
    const localDate = (instant: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: timezone }).format(instant);

    // Nothing before recurStartsAt, nothing after recurUntil.
    for (const instance of instances) {
      const date = localDate(instance.startsAt);
      expect(date >= recurStartsAt).toBe(true);
      expect(date <= recurUntil).toBe(true);
    }
    // The earliest instance actually lands on recurStartsAt itself, not
    // sometime later in the window (every weekday is included, so it must).
    expect(localDate(instances[0].startsAt)).toBe(recurStartsAt);
  });

  it("createSeries defaults recurStartsAt to today when omitted, matching the previous behavior", async () => {
    const timezone = "America/New_York";
    const { series, eventsCreated } = await createSeries(adminId, {
      groupId,
      title: "Default Start Series",
      description: null,
      weekdays: [0, 1, 2, 3, 4, 5, 6],
      startTime: "18:00",
      endTime: "19:00",
      timezone,
      // recurStartsAt omitted on purpose.
      recurUntil: daysFromNow(2, timezone),
      signupOpensRule: "immediately",
      signupOpensDaysBefore: null,
      capacity: 4,
      maxGuestsPerRsvp: null,
      waiverRequired: false,
      generalLocation: null,
      exactLocation: null,
      googleMapsUrl: null,
      appleMapsUrl: null,
      locationRevealPolicy: "always",
      locationRevealHours: null,
    });

    expect(eventsCreated).toBeGreaterThan(0);

    const instances = await prisma.event.findMany({ where: { seriesId: series.id }, orderBy: { startsAt: "asc" } });
    const localDate = (instant: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: timezone }).format(instant);
    expect(localDate(instances[0].startsAt)).toBe(daysFromNow(0, timezone));
  });
});
