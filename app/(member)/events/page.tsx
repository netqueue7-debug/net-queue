import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { needsOnboarding } from "@/lib/auth/onboarding";
import { getActiveGroupIds } from "@/lib/groups/authz";
import { listMyMemberships } from "@/lib/groups/groups";
import { listEventsInRange } from "@/lib/events/events";
import { windowStart, windowEnd } from "@/lib/events/window";
import { zonedDateString } from "@/lib/timezone";
import { parseDateParam, dateKey, addDays, addMonths, startOfWeek, startOfMonth, monthGridRange } from "@/lib/calendar/grid";
import type { EventChip } from "@/components/calendar/event-chip";
import { MonthView } from "@/components/calendar/month-view";
import { GROUP_DOT_CLASS, groupColorTone } from "@/components/calendar/group-color";
import { WeekView } from "./week-view";
import { DayView } from "./day-view";

type ViewMode = "month" | "week" | "day";

function hrefFor(view: ViewMode, date: Date, groupId: string | null): string {
  const group = groupId ? `&group=${groupId}` : "";
  return `/events?view=${view}&date=${dateKey(date)}${group}`;
}

export default async function EventsPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string; date?: string; group?: string }>;
}) {
  const user = await getSession();
  if (!user) redirect("/login");
  if (needsOnboarding(user)) redirect("/onboarding");

  const sp = await searchParams;
  const view: ViewMode = sp.view === "week" ? "week" : sp.view === "day" ? "day" : "month";
  const anchor = parseDateParam(sp.date);

  const [groupIds, memberships] = await Promise.all([getActiveGroupIds(user.id), listMyMemberships(user.id)]);
  const groupNameById = new Map(memberships.map((m) => [m.group.id, m.group.name]));

  // Only a group the viewer is actually an active member of can be
  // filtered to — an unrecognized or stale ?group= just falls back to
  // "all groups" rather than erroring.
  const selectedGroupId = sp.group && groupIds.includes(sp.group) ? sp.group : null;
  const effectiveGroupIds = selectedGroupId ? [selectedGroupId] : groupIds;
  const activeMemberships = memberships.filter((m) => m.status === "active").sort((a, b) => a.group.name.localeCompare(b.group.name));

  let queryStart: Date;
  let queryEnd: Date;
  if (view === "month") {
    const { gridStart, gridEnd } = monthGridRange(anchor);
    queryStart = addDays(gridStart, -1);
    queryEnd = addDays(gridEnd, 1);
  } else if (view === "week") {
    const weekStart = startOfWeek(anchor);
    queryStart = addDays(weekStart, -1);
    queryEnd = addDays(weekStart, 8);
  } else {
    queryStart = addDays(anchor, -1);
    queryEnd = addDays(anchor, 2);
  }

  const events = effectiveGroupIds.length > 0 ? await listEventsInRange(effectiveGroupIds, queryStart, queryEnd) : [];

  // Bucketed by the event's *own* timezone, not the server's — a
  // volleyball night at 9pm Eastern belongs on that calendar day even if
  // this page happens to render on a server in a different zone
  // (lib/timezone.ts#zonedDateString, same approach the day-before
  // reminder cron uses).
  const eventsByDay = new Map<string, EventChip[]>();
  for (const e of events) {
    const key = zonedDateString(e.startsAt, e.timezone);
    const chip: EventChip = {
      id: e.id,
      title: e.title,
      startsAt: e.startsAt,
      endsAt: e.endsAt,
      timezone: e.timezone,
      groupId: e.groupId,
      groupName: groupNameById.get(e.groupId) ?? "",
    };
    if (!eventsByDay.has(key)) eventsByDay.set(key, []);
    eventsByDay.get(key)!.push(chip);
  }
  for (const list of eventsByDay.values()) list.sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());

  let prevAnchor: Date;
  let nextAnchor: Date;
  let title: string;
  if (view === "month") {
    prevAnchor = addMonths(anchor, -1);
    nextAnchor = addMonths(anchor, 1);
    title = anchor.toLocaleDateString(undefined, { month: "long", year: "numeric" });
  } else if (view === "week") {
    prevAnchor = addDays(anchor, -7);
    nextAnchor = addDays(anchor, 7);
    const start = startOfWeek(anchor);
    const end = addDays(start, 6);
    title = `${start.toLocaleDateString(undefined, { month: "short", day: "numeric" })} – ${end.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}`;
  } else {
    prevAnchor = addDays(anchor, -1);
    nextAnchor = addDays(anchor, 1);
    title = anchor.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric", year: "numeric" });
  }

  // Clamped to the 13-month window (lib/events/window.ts) shared with
  // event creation — comparing whole months for month view so "Sep 2026"
  // doesn't get clamped out just because today's exact date is mid-month.
  const winStart = windowStart();
  const winEnd = windowEnd();
  const canGoPrev = view === "month" ? startOfMonth(prevAnchor) >= startOfMonth(winStart) : prevAnchor >= winStart;
  const canGoNext = view === "month" ? startOfMonth(nextAnchor) <= startOfMonth(winEnd) : nextAnchor <= winEnd;

  const navButtonClass = "rounded-md border border-border px-2.5 py-1 text-sm hover:border-accent/40 hover:bg-accent/5";
  const navButtonDisabledClass = "rounded-md border border-border px-2.5 py-1 text-sm text-muted/40";

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-4 p-4 sm:p-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">Events</h1>
        <div className="flex items-center gap-1 rounded-full border border-border p-0.5 text-sm">
          {(["month", "week", "day"] as const).map((v) => (
            <Link
              key={v}
              href={hrefFor(v, anchor, selectedGroupId)}
              className={`rounded-full px-3 py-1 font-medium capitalize transition-colors ${
                view === v ? "bg-accent text-accent-foreground" : "text-muted hover:text-foreground"
              }`}
            >
              {v}
            </Link>
          ))}
        </div>
      </div>

      {activeMemberships.length > 1 && (
        <div className="flex flex-wrap items-center gap-1.5 text-sm">
          <Link
            href={hrefFor(view, anchor, null)}
            className={`rounded-full border px-3 py-1 font-medium transition-colors ${
              selectedGroupId === null
                ? "border-accent bg-accent text-accent-foreground"
                : "border-border text-muted hover:text-foreground"
            }`}
          >
            All groups
          </Link>
          {activeMemberships.map((m) => {
            const active = selectedGroupId === m.group.id;
            return (
              <Link
                key={m.group.id}
                href={hrefFor(view, anchor, m.group.id)}
                className={`flex items-center gap-1.5 rounded-full border px-3 py-1 font-medium transition-colors ${
                  active ? "border-accent bg-accent/10 text-foreground" : "border-border text-muted hover:text-foreground"
                }`}
              >
                <span className={`h-2 w-2 rounded-full ${GROUP_DOT_CLASS[groupColorTone(m.group.id)]}`} />
                {m.group.name}
              </Link>
            );
          })}
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1">
          {canGoPrev ? (
            <Link href={hrefFor(view, prevAnchor, selectedGroupId)} className={navButtonClass} aria-label="Previous">
              ←
            </Link>
          ) : (
            <span className={navButtonDisabledClass}>←</span>
          )}
          <Link href={hrefFor(view, new Date(), selectedGroupId)} className={navButtonClass}>
            Today
          </Link>
          {canGoNext ? (
            <Link href={hrefFor(view, nextAnchor, selectedGroupId)} className={navButtonClass} aria-label="Next">
              →
            </Link>
          ) : (
            <span className={navButtonDisabledClass}>→</span>
          )}
        </div>
        <h2 className="text-sm font-medium text-muted">{title}</h2>
      </div>

      {view === "month" && <MonthView anchor={anchor} eventsByDay={eventsByDay} groupFilter={selectedGroupId} />}
      {view === "week" && <WeekView anchor={anchor} eventsByDay={eventsByDay} />}
      {view === "day" && <DayView events={eventsByDay.get(dateKey(anchor)) ?? []} />}
    </main>
  );
}
