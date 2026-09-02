import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { resolveGroupMembership } from "@/lib/groups/authz";
import { getGroupOrThrow } from "@/lib/groups/groups";
import { GroupNotFoundError } from "@/lib/groups/errors";
import { listEvents } from "@/lib/events/events";
import { CreateEventForm } from "@/app/admin/events/create-event-form";
import { Card } from "@/components/ui/card";

// The general, group-scoped admin events page — reachable for *any* group
// a caller administers (a real group admin, or a platform admin via
// resolveGroupMembership's override, policy.md#6), unlike /admin/events
// which only ever guesses at "your" one group.
export default async function GroupEventsPage({ params }: { params: Promise<{ id: string }> }) {
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

  const events = await listEvents(id);

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 p-4 sm:p-8">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-semibold">{group.name}: Events</h1>
        <div className="flex flex-wrap gap-3 text-sm">
          <Link href={`/admin/groups/${id}/dashboard`} className="underline">
            Dashboard
          </Link>
          <Link href={`/admin/groups/${id}/series`} className="underline">
            Recurring series
          </Link>
          <Link href={`/admin/groups/${id}/guests`} className="underline">
            Pending guests
          </Link>
          <Link href={`/admin/groups/${id}/memberships`} className="underline">
            Pending members
          </Link>
        </div>
      </div>

      <ul className="flex flex-col gap-2">
        {events.map((event) => (
          <li key={event.id}>
            <Card className="p-3">
              <Link href={`/events/${event.id}`} className="font-medium underline">
                {event.title}
              </Link>
              <span className="ml-2 text-sm text-muted">
                ({event.status}
                {event.seriesId ? ", from a series" : ""}
                {event.overridden ? ", edited" : ""})
              </span>
            </Card>
          </li>
        ))}
      </ul>

      <h2 className="text-lg font-medium">Create one-off event</h2>
      <CreateEventForm groupId={id} />
    </main>
  );
}
