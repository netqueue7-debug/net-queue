import { describe, expect, it } from "vitest";
import { serializeEvent } from "@/lib/serializers/event";
import type { Event } from "@/lib/generated/prisma/client";

const SECRET = "123 Main St, Court 4 (side door)";

function baseEvent(overrides: Partial<Event>): Event {
  return {
    id: "evt1",
    seriesId: null,
    overridden: false,
    title: "Volleyball Night",
    description: null,
    startsAt: new Date("2026-09-15T23:00:00Z"), // 7pm America/New_York (EDT, UTC-4)
    endsAt: new Date("2026-09-16T01:00:00Z"),
    timezone: "America/New_York",
    capacity: 20,
    maxGuestsPerRsvp: null,
    signupOpensAt: new Date("2026-09-01T00:00:00Z"),
    generalLocation: "Somewhere in Brooklyn",
    exactLocation: SECRET,
    locationRevealPolicy: "always",
    locationRevealHours: null,
    status: "scheduled",
    createdBy: "admin1",
    createdAt: new Date(),
    ...overrides,
  } as Event;
}

describe("serializeEvent", () => {
  it("admin always sees the exact location, regardless of policy or time", () => {
    const event = baseEvent({ locationRevealPolicy: "hidden" });
    const result = serializeEvent(event, "admin", new Date("2020-01-01T00:00:00Z"));
    expect(result.exactLocation).toBe(SECRET);
  });

  it("`always` policy: member sees exact location regardless of time", () => {
    const event = baseEvent({ locationRevealPolicy: "always" });
    const result = serializeEvent(event, "member", new Date("2020-01-01T00:00:00Z"));
    expect(result.exactLocation).toBe(SECRET);
  });

  it("`hours_before`: hidden before the window, revealed after", () => {
    const event = baseEvent({ locationRevealPolicy: "hours_before", locationRevealHours: 2 });
    // starts 2026-09-15T23:00:00Z, so reveal is 2026-09-15T21:00:00Z
    const before = serializeEvent(event, "member", new Date("2026-09-15T20:59:59Z"));
    expect(before.exactLocation).toBeNull();
    expect(before.generalLocation).toBe("Somewhere in Brooklyn");
    expect(before.locationRevealsAt).toBe("2026-09-15T21:00:00.000Z");

    const after = serializeEvent(event, "member", new Date("2026-09-15T21:00:01Z"));
    expect(after.exactLocation).toBe(SECRET);
    expect(after.locationRevealsAt).toBeNull();
  });

  it("`day_of`: reveals at local midnight of the event's day (DST-aware, summer)", () => {
    const event = baseEvent({ locationRevealPolicy: "day_of" });
    // Sep 15 2026 is EDT (UTC-4) in America/New_York: local midnight = 2026-09-15T04:00:00Z
    const justBefore = serializeEvent(event, "member", new Date("2026-09-15T03:59:59Z"));
    expect(justBefore.exactLocation).toBeNull();
    expect(justBefore.generalLocation).toBe("Somewhere in Brooklyn");

    const justAfter = serializeEvent(event, "member", new Date("2026-09-15T04:00:01Z"));
    expect(justAfter.exactLocation).toBe(SECRET);
  });

  it("`day_of`: reveals at local midnight of the event's day (DST-aware, winter)", () => {
    // Jan 10 2026 is EST (UTC-5) in America/New_York: local midnight = 2026-01-10T05:00:00Z
    const event = baseEvent({
      locationRevealPolicy: "day_of",
      startsAt: new Date("2026-01-11T00:00:00Z"), // 7pm Jan 10 EST
      endsAt: new Date("2026-01-11T02:00:00Z"),
    });
    const justBefore = serializeEvent(event, "member", new Date("2026-01-10T04:59:59Z"));
    expect(justBefore.exactLocation).toBeNull();

    const justAfter = serializeEvent(event, "member", new Date("2026-01-10T05:00:01Z"));
    expect(justAfter.exactLocation).toBe(SECRET);
  });

  it("`hidden`: nothing at all (not even generalLocation) until day-of", () => {
    const event = baseEvent({ locationRevealPolicy: "hidden" });
    const before = serializeEvent(event, "member", new Date("2026-09-15T03:59:59Z"));
    expect(before.exactLocation).toBeNull();
    expect(before.generalLocation).toBeNull();
    expect(before.locationRevealsAt).toBeNull();

    const after = serializeEvent(event, "member", new Date("2026-09-15T04:00:01Z"));
    expect(after.exactLocation).toBe(SECRET);
    expect(after.generalLocation).toBe("Somewhere in Brooklyn");
  });

  it("the raw serialized JSON for a pre-reveal event contains no substring of the exact location", () => {
    const event = baseEvent({ locationRevealPolicy: "hours_before", locationRevealHours: 2 });
    const result = serializeEvent(event, "member", new Date("2026-09-15T20:59:59Z"));
    const raw = JSON.stringify(result);
    expect(raw.includes(SECRET)).toBe(false);
  });
});
