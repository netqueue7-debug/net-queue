import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { resolveGroupMembership } from "@/lib/groups/authz";
import { getGroupOrThrow } from "@/lib/groups/groups";
import { GroupNotFoundError } from "@/lib/groups/errors";
import { getGroupEventsDashboard, getGroupDashboardSummary } from "@/lib/admin/dashboard";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";

// "Upcoming events at a glance" (docs/phase-3-polish.md) — fill rate,
// pending guest approvals, and outstanding waivers per event, plus the
// group-wide pending-membership/guest counts. Distinct from
// /admin/groups/:id/events (the plain CRUD list) — this is the overview.
export default async function GroupDashboardPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await getSession();
  if (!user) redirect("/login");

  const { id } = await params;
  const membership = await resolveGroupMembership(id, user.id);
  if (!membership || membership.role !== "admin") notFound();

  let group;
  try {
    group = await getGroupOrThrow(id);
  } catch (e) {
    if (e instanceof GroupNotFoundError) notFound();
    throw e;
  }

  const [events, summary] = await Promise.all([getGroupEventsDashboard(id), getGroupDashboardSummary(id)]);

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 p-4 sm:p-8">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-semibold">{group.name}: Dashboard</h1>
        <div className="flex gap-3 text-sm">
          <Link href={`/admin/groups/${id}/events`} className="underline">
            Manage events
          </Link>
          <Link href={`/groups/${id}/members`} className="underline">
            Members
          </Link>
        </div>
      </div>

      <div className="flex flex-wrap gap-3 text-sm">
        <Link href={`/groups/${id}/members`} className="rounded border border-border px-3 py-2 underline">
          {summary.pendingMembershipCount} pending member{summary.pendingMembershipCount === 1 ? "" : "s"}
        </Link>
        <Link href={`/admin/groups/${id}/guests`} className="rounded border border-border px-3 py-2 underline">
          {summary.pendingGuestCount} pending guest{summary.pendingGuestCount === 1 ? "" : "s"}
        </Link>
      </div>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-medium">Upcoming events</h2>
        {events.length === 0 && <EmptyState>Nothing scheduled.</EmptyState>}
        <ul className="flex flex-col gap-2">
          {events.map((event) => (
            <li key={event.id}>
              <Card className="p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <Link href={`/events/${event.id}`} className="font-medium underline">
                    {event.title}
                  </Link>
                  <span className="text-sm text-muted">{new Date(event.startsAt).toLocaleDateString()}</span>
                </div>
                <p className="text-sm text-muted">
                  {event.capacity === null
                    ? `${event.goingSeats} going (uncapped)`
                    : `${event.goingSeats}/${event.capacity} seats filled (${Math.round((event.fillRate ?? 0) * 100)}%)`}
                </p>
                {(event.pendingGuestCount > 0 || event.outstandingWaiverCount > 0) && (
                  <p className="text-sm text-warning">
                    {event.pendingGuestCount > 0 && `${event.pendingGuestCount} guest(s) pending approval`}
                    {event.pendingGuestCount > 0 && event.outstandingWaiverCount > 0 && " · "}
                    {event.outstandingWaiverCount > 0 && `${event.outstandingWaiverCount} outstanding waiver(s)`}
                  </p>
                )}
              </Card>
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
