// Shared timezone math — no date library. Originally lived only in
// lib/serializers/event.ts (location-reveal timing); generalized here so
// series materialization (lib/events/recurrence.ts) can convert an
// arbitrary wall-clock "HH:mm" on a given calendar date to a UTC instant
// using the exact same, already-DST-tested approach.

// What the target timezone's UTC offset is, in minutes, at the given
// instant (positive east of Greenwich). Computed by formatting the
// instant's wall-clock time in that zone, re-reading those components as
// if they were UTC, and diffing against the real instant.
export function getTimezoneOffsetMinutes(timeZone: string, date: Date): number {
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

// The UTC instant corresponding to wall-clock `HH:mm` on calendar date
// `YYYY-MM-DD`, in `timezone`. One-step guess-and-correct: build the
// instant as if the wall clock were UTC, then shift by that guess's actual
// offset in the target zone. Accurate everywhere except the (irrelevant
// here) ambiguous/skipped hour at the instant of a DST transition itself.
export function zonedTimeToUtc(dateStr: string, timeStr: string, timezone: string): Date {
  const guessUtc = new Date(`${dateStr}T${timeStr}:00Z`);
  const offsetMinutes = getTimezoneOffsetMinutes(timezone, guessUtc);
  return new Date(guessUtc.getTime() - offsetMinutes * 60_000);
}

// The calendar date (YYYY-MM-DD) that `instant` falls on in `timezone`.
export function zonedDateString(instant: Date, timezone: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(instant);
}

// The UTC instant corresponding to local midnight, in `timezone`, of the
// calendar date that `instant` falls on in that same timezone.
export function localMidnightOf(instant: Date, timezone: string): Date {
  return zonedTimeToUtc(zonedDateString(instant, timezone), "00:00", timezone);
}

// The weekday `instant` falls on in `timezone`, in the same
// `Date#getUTCDay()` numbering (0 = Sunday .. 6 = Saturday) that
// lib/events/recurrence.ts#generateOccurrenceDates uses to build a series'
// occurrences in the first place — so a materialized instance's weekday can
// be recovered exactly as it was chosen.
export function zonedWeekday(instant: Date, timezone: string): number {
  return new Date(`${zonedDateString(instant, timezone)}T00:00:00Z`).getUTCDay();
}
