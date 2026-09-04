import Link from "next/link";
import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { needsOnboarding } from "@/lib/auth/onboarding";
import { listEventsForMember } from "@/lib/rsvp/event-detail";
import { formatTime } from "@/lib/format-datetime";
import { listMyMemberships } from "@/lib/groups/groups";
import { countUnreadNotifications } from "@/lib/notifications/notifications";
import { getDefaultAdminGroupId } from "@/lib/groups/authz";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Badge } from "@/components/ui/badge";
import { GroupCardHeader } from "@/components/ui/group-avatar";
import { CalendarIcon, UsersIcon, BellIcon, ShieldIcon, ChevronRightIcon, AlertIcon } from "@/components/ui/icons";

const UPCOMING_LIMIT = 3;
const GROUPS_LIMIT = 3;

function greeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

function StatTile({ href, icon, label, value, warn = false }: { href: string; icon: ReactNode; label: string; value: number; warn?: boolean }) {
  const active = warn && value > 0;
  return (
    <Link href={href} className="block">
      <Card className="flex flex-col items-center gap-1.5 py-4 text-center transition-shadow hover:shadow-md">
        <span className={`flex h-9 w-9 items-center justify-center rounded-full ${active ? "bg-danger/10 text-danger" : "bg-accent/10 text-accent"}`}>
          {icon}
        </span>
        <span className="text-xl font-bold leading-none">{value}</span>
        <span className="text-xs text-muted">{label}</span>
      </Card>
    </Link>
  );
}

export default async function MemberHomePage() {
  const user = await getSession();
  if (!user) redirect("/login");
  if (needsOnboarding(user)) redirect("/onboarding");

  const [events, memberships, unreadCount, adminGroupId] = await Promise.all([
    listEventsForMember(user),
    listMyMemberships(user.id),
    countUnreadNotifications(user.id),
    getDefaultAdminGroupId(user.id),
  ]);

  const upcoming = events.slice(0, UPCOMING_LIMIT);
  const outstandingWaivers = memberships.filter((m) => m.status === "active" && !m.waiverUpToDate);
  const showAdmin = user.role === "admin" || adminGroupId !== null;

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-8 p-4 sm:p-8">
      <section>
        <p className="text-sm font-medium text-accent">{greeting()}</p>
        <h1 className="text-3xl font-bold tracking-tight">{user.displayName}</h1>
      </section>

      <div className="grid grid-cols-3 gap-3">
        <StatTile href="/events" icon={<CalendarIcon width={17} height={17} />} label="Upcoming" value={events.length} />
        <StatTile href="/groups" icon={<UsersIcon width={17} height={17} />} label="Groups" value={memberships.length} />
        <StatTile href="/notifications" icon={<BellIcon width={17} height={17} />} label="Unread" value={unreadCount} warn />
      </div>

      {outstandingWaivers.length > 0 && (
        <Card className="flex items-start gap-3 border-danger/30 bg-danger/5">
          <AlertIcon width={18} height={18} className="mt-0.5 flex-shrink-0 text-danger" />
          <p className="text-sm text-danger">
            {outstandingWaivers.length === 1
              ? `You have an outstanding waiver for ${outstandingWaivers[0].group.name}. `
              : `You have outstanding waivers in ${outstandingWaivers.length} groups. `}
            <Link
              href={outstandingWaivers.length === 1 ? `/groups/${outstandingWaivers[0].group.id}/waiver` : "/groups"}
              className="font-medium underline"
            >
              Review
            </Link>
          </p>
        </Card>
      )}

      <section className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-lg font-semibold">Upcoming events</h2>
          <Link href="/events" className="text-sm font-medium text-accent hover:underline">
            See all
          </Link>
        </div>

        {upcoming.length === 0 && <EmptyState>No upcoming events. Check your groups for what&apos;s scheduled.</EmptyState>}

        <ul className="flex flex-col gap-3">
          {upcoming.map(({ event, seatsRemaining, yourStatus }) => {
            const starts = new Date(event.startsAt);
            const month = starts.toLocaleDateString(undefined, { month: "short", timeZone: event.timezone }).toUpperCase();
            const day = Number(starts.toLocaleDateString(undefined, { day: "numeric", timeZone: event.timezone }));
            const time = formatTime(starts, event.timezone);
            const seatsText = seatsRemaining === null ? "Unlimited seats" : seatsRemaining > 0 ? `${seatsRemaining} seats left` : "Waitlist only";

            return (
              <li key={event.id}>
                <Link href={`/events/${event.id}`} className="group block">
                  <Card className="flex items-center gap-4 transition-shadow hover:shadow-md">
                    <div className="flex w-14 flex-shrink-0 flex-col items-center justify-center rounded-lg bg-accent/10 py-2 text-accent">
                      <span className="text-[11px] font-semibold tracking-wide">{month}</span>
                      <span className="text-xl leading-none font-bold">{day}</span>
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium group-hover:underline">{event.title}</p>
                      <p className="text-sm text-muted">
                        {time} · {seatsText}
                      </p>
                    </div>
                    {yourStatus && (
                      <Badge tone={yourStatus === "going" ? "success" : "warning"}>{yourStatus === "going" ? "Going" : "Waitlisted"}</Badge>
                    )}
                    <ChevronRightIcon width={16} height={16} className="hidden flex-shrink-0 text-muted sm:block" />
                  </Card>
                </Link>
              </li>
            );
          })}
        </ul>
      </section>

      <section className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-lg font-semibold">Your groups</h2>
          <Link href="/groups" className="text-sm font-medium text-accent hover:underline">
            See all
          </Link>
        </div>

        {memberships.length === 0 && (
          <EmptyState>You&apos;re not in any groups yet. Ask whoever runs your group for a join link or code.</EmptyState>
        )}

        <ul className="flex flex-col gap-3">
          {memberships.slice(0, GROUPS_LIMIT).map((m) => {
            const header = (
              <GroupCardHeader
                name={m.group.name}
                imageUrl={m.group.imageUrl}
                size="sm"
                badge={
                  <Badge tone={m.status === "pending" ? "warning" : m.role === "admin" ? "info" : "neutral"}>
                    {m.status === "pending" ? "Pending" : m.role === "admin" ? "Admin" : "Member"}
                  </Badge>
                }
              />
            );

            return (
              <li key={m.group.id}>
                <Card className={m.status === "active" ? "transition-shadow hover:shadow-md" : undefined}>
                  {m.status === "active" ? (
                    <Link href={`/groups/${m.group.id}/calendar?from=home`} className="block">
                      {header}
                    </Link>
                  ) : (
                    header
                  )}
                  {m.status === "active" && !m.waiverUpToDate && (
                    <Link href={`/groups/${m.group.id}/waiver`} className="mt-2 inline-block text-sm text-danger underline">
                      Outstanding waiver
                    </Link>
                  )}
                </Card>
              </li>
            );
          })}
        </ul>
      </section>

      {showAdmin && (
        <div className="border-t border-border pt-5">
          <Link
            href="/admin"
            className="inline-flex items-center gap-1.5 rounded-full border border-border px-3 py-1.5 text-sm font-medium transition-colors hover:border-accent/40 hover:bg-accent/5"
          >
            <ShieldIcon width={15} height={15} />
            Admin
          </Link>
        </div>
      )}
    </main>
  );
}
