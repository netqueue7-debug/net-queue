// Pure calendar-grid date math — no timezone conversion, no DB. Every Date
// here represents a plain calendar date at local midnight (the "which
// square is this" concern). Which day an *event* actually lands on is a
// separate question, answered by bucketing on the event's own timezone via
// lib/timezone.ts#zonedDateString — see app/(member)/events/page.tsx.

export function parseDateParam(value: string | undefined): Date {
  if (value) {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
    if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  }
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

export function dateKey(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function addDays(d: Date, n: number): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
}

// Always lands on the 1st — month view only cares which month, not which
// day within it.
export function addMonths(d: Date, n: number): Date {
  return new Date(d.getFullYear(), d.getMonth() + n, 1);
}

export function startOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

// The Sunday on/before `d`.
export function startOfWeek(d: Date): Date {
  return addDays(d, -d.getDay());
}

// [gridStart, gridEnd) covering the full 7-column weeks needed to render
// d's whole month — gridEnd is exclusive (the first grid day after the
// visible range).
export function monthGridRange(d: Date): { gridStart: Date; gridEnd: Date } {
  const firstOfMonth = startOfMonth(d);
  const firstOfNextMonth = addMonths(d, 1);
  const gridStart = startOfWeek(firstOfMonth);
  const lastGridDayOfMonth = addDays(firstOfNextMonth, -1);
  const gridEnd = addDays(startOfWeek(lastGridDayOfMonth), 7);
  return { gridStart, gridEnd };
}

export function monthGridWeeks(d: Date): Date[][] {
  const { gridStart, gridEnd } = monthGridRange(d);
  const weeks: Date[][] = [];
  let cursor = gridStart;
  while (cursor < gridEnd) {
    const week: Date[] = [];
    for (let i = 0; i < 7; i++) {
      week.push(cursor);
      cursor = addDays(cursor, 1);
    }
    weeks.push(week);
  }
  return weeks;
}

export function weekDays(d: Date): Date[] {
  const start = startOfWeek(d);
  return Array.from({ length: 7 }, (_, i) => addDays(start, i));
}
