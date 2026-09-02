import { zonedDateString, zonedTimeToUtc } from "@/lib/timezone";
import type { EventSeries } from "@/lib/generated/prisma/client";

export interface SeriesOccurrence {
  year: number;
  month: number; // 1-12
  day: number;
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

// Every calendar date matching one of `weekdays` (JS `Date#getUTCDay()`
// numbering: 0 = Sunday .. 6 = Saturday) from `from` through `until`
// inclusive, evaluated in `timezone` — not the server's local time or UTC.
// Iterates via a pure calendar-date cursor (labeled UTC but never
// interpreted as a real instant), so this is immune to DST entirely: it's
// enumerating Y-M-D combinations, not wall-clock arithmetic.
export function generateOccurrenceDates(
  weekdays: number[],
  timezone: string,
  from: Date,
  until: Date,
): SeriesOccurrence[] {
  const weekdaySet = new Set(weekdays);
  const fromStr = zonedDateString(from, timezone);
  const untilStr = zonedDateString(until, timezone);

  const occurrences: SeriesOccurrence[] = [];
  let cursor = new Date(`${fromStr}T00:00:00Z`);
  const end = new Date(`${untilStr}T00:00:00Z`);

  while (cursor.getTime() <= end.getTime()) {
    if (weekdaySet.has(cursor.getUTCDay())) {
      occurrences.push({ year: cursor.getUTCFullYear(), month: cursor.getUTCMonth() + 1, day: cursor.getUTCDate() });
    }
    cursor = new Date(cursor.getTime() + 24 * 60 * 60 * 1000);
  }

  return occurrences;
}

export interface MaterializedInstance {
  startsAt: Date;
  endsAt: Date;
  signupOpensAt: Date;
}

// Converts one calendar occurrence into concrete, DST-correct UTC instants
// using the series' own wall-clock start/end time and signup-open rule.
// `materializedAt` is the "now" for `signupOpensRule: "immediately"` — as
// soon as the instance exists, signup is open — passed in rather than read
// live so a whole series materializes with one consistent timestamp.
export function materializeOccurrence(
  series: Pick<EventSeries, "startTime" | "endTime" | "timezone" | "signupOpensRule" | "signupOpensDaysBefore">,
  occurrence: SeriesOccurrence,
  materializedAt: Date,
): MaterializedInstance {
  const dateStr = `${occurrence.year}-${pad(occurrence.month)}-${pad(occurrence.day)}`;
  const startsAt = zonedTimeToUtc(dateStr, series.startTime, series.timezone);
  const endsAt = zonedTimeToUtc(dateStr, series.endTime, series.timezone);

  const signupOpensAt =
    series.signupOpensRule === "immediately"
      ? materializedAt
      : new Date(startsAt.getTime() - (series.signupOpensDaysBefore ?? 0) * 24 * 60 * 60 * 1000);

  return { startsAt, endsAt, signupOpensAt };
}
