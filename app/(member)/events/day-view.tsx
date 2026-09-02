import Link from "next/link";
import { formatTime } from "@/lib/format-datetime";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { GROUP_DOT_CLASS, groupColorTone } from "@/components/calendar/group-color";
import type { EventChip } from "@/components/calendar/event-chip";

export function DayView({ events }: { events: EventChip[] }) {
  if (events.length === 0) return <EmptyState>No events this day.</EmptyState>;

  return (
    <ul className="flex flex-col gap-2">
      {events.map((e) => (
        <li key={e.id}>
          <Link href={`/events/${e.id}`} className="block">
            <Card className="transition-shadow hover:shadow-md">
              <p className="truncate font-medium">{e.title}</p>
              <p className="text-sm text-muted">
                {formatTime(e.startsAt)} – {formatTime(e.endsAt)}
              </p>
              {e.groupName && (
                <p className="flex items-center gap-1.5 truncate text-sm text-muted">
                  <span className={`h-1.5 w-1.5 flex-shrink-0 rounded-full ${GROUP_DOT_CLASS[groupColorTone(e.groupId)]}`} />
                  {e.groupName}
                </p>
              )}
            </Card>
          </Link>
        </li>
      ))}
    </ul>
  );
}
