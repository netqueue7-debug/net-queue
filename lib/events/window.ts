// The queryable/creatable window for events — a single source of truth
// shared by the calendar view's navigation bounds (lib/events/events.ts's
// listEventsInRange callers) and createEventSchema/updateEventSchema's
// validation, so "how far back and forward this app goes" can't drift
// between what you can create and what the calendar can show.
export const WINDOW_MONTHS_PAST = 1;
export const WINDOW_MONTHS_FUTURE = 12;

export function windowStart(now: Date = new Date()): Date {
  const d = new Date(now);
  d.setMonth(d.getMonth() - WINDOW_MONTHS_PAST);
  return d;
}

export function windowEnd(now: Date = new Date()): Date {
  const d = new Date(now);
  d.setMonth(d.getMonth() + WINDOW_MONTHS_FUTURE);
  return d;
}
