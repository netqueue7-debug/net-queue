import Link from "next/link";
import { dateKey, monthGridWeeks } from "@/lib/calendar/grid";
import { formatTime } from "@/lib/format-datetime";
import { GROUP_CHIP_CLASS, groupColorTone } from "./group-color";
import type { EventChip } from "./event-chip";

const WEEKDAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MAX_VISIBLE_PER_DAY = 3;

// `groupFilter` is only threaded through to keep the "+N more" link
// consistent with whatever group filter the caller (the /events page) has
// applied — the per-group color legend itself now lives in that page's
// filter bar, not here, so a single-group calendar (e.g.
// /groups/:id/calendar) has nothing extra to render.
export function MonthView({
  anchor,
  eventsByDay,
  groupFilter = null,
}: {
  anchor: Date;
  eventsByDay: Map<string, EventChip[]>;
  groupFilter?: string | null;
}) {
  const weeks = monthGridWeeks(anchor);
  const currentMonth = anchor.getMonth();
  const todayKey = dateKey(new Date());
  const groupParam = groupFilter ? `&group=${groupFilter}` : "";

  return (
    <div className="flex flex-col gap-3">
      <div className="overflow-hidden rounded-xl border border-border">
        <div className="grid grid-cols-7 border-b border-border bg-surface text-center text-xs font-medium text-muted">
          {WEEKDAY_LABELS.map((w) => (
            <div key={w} className="py-2">
              {w}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7">
          {weeks.flat().map((day) => {
            const key = dateKey(day);
            const dayEvents = eventsByDay.get(key) ?? [];
            const inMonth = day.getMonth() === currentMonth;
            const isToday = key === todayKey;

            return (
              <div
                key={key}
                className={`min-h-[88px] border-b border-r border-border p-1.5 [&:nth-child(7n)]:border-r-0 ${inMonth ? "" : "bg-surface/50"}`}
              >
                <span
                  className={`inline-flex h-5 w-5 items-center justify-center rounded-full text-xs ${
                    isToday ? "bg-accent font-semibold text-accent-foreground" : inMonth ? "text-foreground" : "text-muted"
                  }`}
                >
                  {day.getDate()}
                </span>
                <div className="mt-1 flex flex-col gap-0.5">
                  {dayEvents.slice(0, MAX_VISIBLE_PER_DAY).map((e) => (
                    <Link
                      key={e.id}
                      href={`/events/${e.id}`}
                      className={`block rounded px-1 py-0.5 leading-tight ${GROUP_CHIP_CLASS[groupColorTone(e.groupId)]}`}
                      title={e.groupName ? `${e.title} — ${e.groupName}` : e.title}
                    >
                      <span className="block truncate text-[11px] font-medium">{e.title}</span>
                      <span className="block truncate text-[10px] opacity-80">
                        {formatTime(e.startsAt)} – {formatTime(e.endsAt)}
                      </span>
                    </Link>
                  ))}
                  {dayEvents.length > MAX_VISIBLE_PER_DAY && (
                    <Link href={`/events?view=day&date=${key}${groupParam}`} className="text-[11px] text-muted hover:underline">
                      +{dayEvents.length - MAX_VISIBLE_PER_DAY} more
                    </Link>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
