import type { Event } from "@/lib/generated/prisma/client";
import { localMidnightOf } from "@/lib/timezone";

export interface SerializedEvent {
  id: string;
  title: string;
  description: string | null;
  startsAt: string;
  endsAt: string;
  timezone: string;
  capacity: number | null;
  maxGuestsPerRsvp: number | null;
  waiverRequired: boolean;
  signupOpensAt: string;
  status: string;
  locationRevealPolicy: string;
  locationRevealHours: number | null;
  generalLocation: string | null;
  exactLocation: string | null;
  // Gated identically to exactLocation — a map link is at least as
  // precise as the address text, so it must never be visible any earlier.
  googleMapsUrl: string | null;
  appleMapsUrl: string | null;
  locationRevealsAt: string | null;
  // Hand-edited independently of its series (lib/events/series.ts's
  // "this event vs. all following" model) — a future series-wide edit
  // skips this instance permanently. Not sensitive, shown to every viewer
  // so the admin UI can explain why "Edit series" won't touch it.
  overridden: boolean;
}

// Exported for lib/notifications/jobs.ts's location-reveal cron job — same
// "when does this event's location become visible" calculation, reused
// rather than duplicated.
export function locationRevealAt(event: Event): Date {
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
    waiverRequired: event.waiverRequired,
    signupOpensAt: event.signupOpensAt.toISOString(),
    status: event.status,
    locationRevealPolicy: event.locationRevealPolicy,
    locationRevealHours: event.locationRevealHours,
    overridden: event.overridden,
  };

  if (viewerRole === "admin") {
    return {
      ...base,
      generalLocation: event.generalLocation,
      exactLocation: event.exactLocation,
      googleMapsUrl: event.googleMapsUrl,
      appleMapsUrl: event.appleMapsUrl,
      locationRevealsAt: null,
    };
  }

  if (event.locationRevealPolicy === "always") {
    return {
      ...base,
      generalLocation: event.generalLocation,
      exactLocation: event.exactLocation,
      googleMapsUrl: event.googleMapsUrl,
      appleMapsUrl: event.appleMapsUrl,
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
      googleMapsUrl: revealed ? event.googleMapsUrl : null,
      appleMapsUrl: revealed ? event.appleMapsUrl : null,
      locationRevealsAt: null,
    };
  }

  return {
    ...base,
    generalLocation: event.generalLocation,
    exactLocation: revealed ? event.exactLocation : null,
    googleMapsUrl: revealed ? event.googleMapsUrl : null,
    appleMapsUrl: revealed ? event.appleMapsUrl : null,
    locationRevealsAt: revealed ? null : revealAt.toISOString(),
  };
}
