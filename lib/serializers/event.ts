import type { Event } from "@/lib/generated/prisma/client";

export interface SerializedEvent {
  id: string;
  title: string;
  description: string | null;
  startsAt: string;
  endsAt: string;
  timezone: string;
  capacity: number | null;
  maxGuestsPerRsvp: number | null;
  signupOpensAt: string;
  status: string;
  locationRevealPolicy: string;
  locationRevealHours: number | null;
  generalLocation: string | null;
  exactLocation: string | null;
  locationRevealsAt: string | null;
}

// What the target timezone's UTC offset is, in minutes, at the given
// instant (positive east of Greenwich). Computed by formatting the
// instant's wall-clock time in that zone, re-reading those components as
// if they were UTC, and diffing against the real instant — no date library.
function getTimezoneOffsetMinutes(timeZone: string, date: Date): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(date);

  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  const asUTC = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second"));
  return (asUTC - date.getTime()) / 60_000;
}

// The UTC instant corresponding to local midnight, in `timezone`, of the
// calendar date that `instant` falls on in that same timezone.
function localMidnightOf(instant: Date, timezone: string): Date {
  const dateStr = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(instant); // "YYYY-MM-DD"

  const guessUtc = new Date(`${dateStr}T00:00:00Z`);
  const offsetMinutes = getTimezoneOffsetMinutes(timezone, guessUtc);
  return new Date(guessUtc.getTime() - offsetMinutes * 60_000);
}

function locationRevealAt(event: Event): Date {
  if (event.locationRevealPolicy === "hours_before") {
    const hours = event.locationRevealHours ?? 0;
    return new Date(event.startsAt.getTime() - hours * 60 * 60 * 1000);
  }
  // day_of and hidden both reveal at local midnight of the event's day.
  return localMidnightOf(event.startsAt, event.timezone);
}

// Decides what location fields ship to the client, per policy + current
// time + viewer role. Admins always see full location. Everyone else:
// `always` → full; `hours_before` / `day_of` → generalLocation now, plus a
// revealsAt timestamp, until the reveal moment passes; `hidden` → nothing
// at all (not even generalLocation) until day-of. exactLocation is `null`
// — never present as a string — until its reveal time, so there is nothing
// in the JSON to leak (architecture.md#location-gating).
export function serializeEvent(
  event: Event,
  viewerRole: "member" | "admin" | null,
  now: Date = new Date(),
): SerializedEvent {
  const base = {
    id: event.id,
    title: event.title,
    description: event.description,
    startsAt: event.startsAt.toISOString(),
    endsAt: event.endsAt.toISOString(),
    timezone: event.timezone,
    capacity: event.capacity,
    maxGuestsPerRsvp: event.maxGuestsPerRsvp,
    signupOpensAt: event.signupOpensAt.toISOString(),
    status: event.status,
    locationRevealPolicy: event.locationRevealPolicy,
    locationRevealHours: event.locationRevealHours,
  };

  if (viewerRole === "admin") {
    return {
      ...base,
      generalLocation: event.generalLocation,
      exactLocation: event.exactLocation,
      locationRevealsAt: null,
    };
  }

  if (event.locationRevealPolicy === "always") {
    return {
      ...base,
      generalLocation: event.generalLocation,
      exactLocation: event.exactLocation,
      locationRevealsAt: null,
    };
  }

  const revealAt = locationRevealAt(event);
  const revealed = now >= revealAt;

  if (event.locationRevealPolicy === "hidden") {
    return {
      ...base,
      generalLocation: revealed ? event.generalLocation : null,
      exactLocation: revealed ? event.exactLocation : null,
      locationRevealsAt: null,
    };
  }

  return {
    ...base,
    generalLocation: event.generalLocation,
    exactLocation: revealed ? event.exactLocation : null,
    locationRevealsAt: revealed ? null : revealAt.toISOString(),
  };
}
