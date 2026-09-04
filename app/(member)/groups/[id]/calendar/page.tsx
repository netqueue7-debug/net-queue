import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { needsOnboarding } from "@/lib/auth/onboarding";
import { resolveGroupMembership } from "@/lib/groups/authz";
import { getGroupOrThrow } from "@/lib/groups/groups";
import { GroupNotFoundError } from "@/lib/groups/errors";
import { listEventsInRange } from "@/lib/events/events";
import { windowStart, windowEnd } from "@/lib/events/window";
import { zonedDateString } from "@/lib/timezone";
import { parseDateParam, dateKey, addDays, addMonths, startOfMonth, monthGridRange } from "@/lib/calendar/grid";
import type { EventChip } from "@/components/calendar/event-chip";
import { MonthView } from "@/components/calendar/month-view";
import { CreateEventToggle } from "./create-event-toggle";

export default async function GroupCalendarPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ date?: string; new?: string; from?: string }>;
}) {
  const user = await getSession();
  if (!user) redirect("/login");
  if (needsOnboarding(user)) redirect("/onboarding");

  const { id } = await params;
  const sp = await searchParams;

  // resolveGroupMembership honors the platform-admin override (policy.md#6)
  // — same as the event detail page — so a platform admin can view any
  // group's calendar without needing a real membership row.
  const membership = await resolveGroupMembership(id, user.id);
  if (!membership) notFound();

  let group;
  try {
    group = await getGroupOrThrow(id);
  } catch (e) {
    if (e instanceof GroupNotFoundError) notFound();
    throw e;
  }

  const anchor = parseDateParam(sp.date);
  const { gridStart, gridEnd } = monthGridRange(anchor);
  const events = await listEventsInRange([id], addDays(gridStart, -1), addDays(gridEnd, 1));

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
      groupName: group.name,
    };
    if (!eventsByDay.has(key)) eventsByDay.set(key, []);
    eventsByDay.get(key)!.push(chip);
  }
  for (const list of eventsByDay.values()) list.sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());

  const prevAnchor = addMonths(anchor, -1);
  const nextAnchor = addMonths(anchor, 1);
  const winStart = windowStart();
  const winEnd = windowEnd();
  const canGoPrev = startOfMonth(prevAnchor) >= startOfMonth(winStart);
  const canGoNext = startOfMonth(nextAnchor) <= startOfMonth(winEnd);

  const cameFromHome = sp.from === "home";
  const hrefFor = (date: Date) => `/groups/${id}/calendar?date=${dateKey(date)}${cameFromHome ? "&from=home" : ""}`;
  const navButtonClass = "rounded-md border border-border px-2.5 py-1 text-sm hover:border-accent/40 hover:bg-accent/5";
  const navButtonDisabledClass = "rounded-md border border-border px-2.5 py-1 text-sm text-muted/40";

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-4 p-4 sm:p-8">
      <div>
        <Link href={cameFromHome ? "/home" : "/groups"} className="text-sm text-muted hover:underline">
          {cameFromHome ? "← Home" : "← Your groups"}
        </Link>
        <h1 className="text-2xl font-semibold">{group.name}</h1>
      </div>

      {membership.role === "admin" && <CreateEventToggle groupId={id} defaultOpen={sp.new === "1"} />}

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1">
          {canGoPrev ? (
            <Link href={hrefFor(prevAnchor)} className={navButtonClass} aria-label="Previous month">
              ←
            </Link>
          ) : (
            <span className={navButtonDisabledClass}>←</span>
          )}
          <Link href={hrefFor(new Date())} className={navButtonClass}>
            Today
          </Link>
          {canGoNext ? (
            <Link href={hrefFor(nextAnchor)} className={navButtonClass} aria-label="Next month">
              →
            </Link>
          ) : (
            <span className={navButtonDisabledClass}>→</span>
          )}
        </div>
        <h2 className="text-sm font-medium text-muted">{anchor.toLocaleDateString(undefined, { month: "long", year: "numeric" })}</h2>
      </div>

      <MonthView anchor={anchor} eventsByDay={eventsByDay} backHref={hrefFor(anchor)} />
    </main>
  );
}
