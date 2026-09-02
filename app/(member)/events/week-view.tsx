import Link from "next/link";
import { dateKey, weekDays } from "@/lib/calendar/grid";
import { formatTime } from "@/lib/format-datetime";
import { Card } from "@/components/ui/card";
import { GROUP_DOT_CLASS, groupColorTone } from "@/components/calendar/group-color";
import type { EventChip } from "@/components/calendar/event-chip";

const WEEKDAY_LABELS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export function WeekView({
  anchor,
  eventsByDay,
  backHref,
}: {
  anchor: Date;
  eventsByDay: Map<string, EventChip[]>;
  backHref: string;
}) {
  const days = weekDays(anchor);
  const todayKey = dateKey(new Date());
  const fromParam = `from=${encodeURIComponent(backHref)}`;

  return (
    <div className="flex flex-col gap-4">
      {days.map((day, i) => {
        const key = dateKey(day);
        const dayEvents = eventsByDay.get(key) ?? [];
        const isToday = key === todayKey;

        return (
          <div key={key}>
            <p className={`text-sm font-medium ${isToday ? "text-accent" : "text-muted"}`}>
              {WEEKDAY_LABELS[i]}, {day.toLocaleDateString(undefined, { month: "short", day: "numeric" })}
            </p>
            {dayEvents.length === 0 ? (
              <p className="pl-1 text-sm text-muted">No events</p>
            ) : (
              <ul className="mt-1 flex flex-col gap-1.5">
                {dayEvents.map((e) => (
                  <li key={e.id}>
                    <Link href={`/events/${e.id}?${fromParam}`} className="block">
                      <Card className="px-3 py-2 transition-shadow hover:shadow-md">
                        <p className="truncate font-medium">{e.title}</p>
                        <p className="text-xs text-muted">
                          {formatTime(e.startsAt, e.timezone)} – {formatTime(e.endsAt, e.timezone)}
                        </p>
                        {e.groupName && (
                          <p className="flex items-center gap-1.5 truncate text-xs text-muted">
                            <span className={`h-1.5 w-1.5 flex-shrink-0 rounded-full ${GROUP_DOT_CLASS[groupColorTone(e.groupId)]}`} />
                            {e.groupName}
                          </p>
                        )}
                      </Card>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>
        );
      })}
    </div>
  );
}
