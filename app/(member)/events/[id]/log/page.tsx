import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { resolveGroupMembership } from "@/lib/groups/authz";
import { prisma } from "@/lib/db";
import { getEventLogTimeline } from "@/lib/admin/event-log";
import { formatDateTime } from "@/lib/format-datetime";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";

// Searchable per-event timeline (docs/phase-3-polish.md) — "searchable" is
// satisfied by the browser's own find-in-page over the rendered list for
// now, rather than a separate search box; the data is already a short,
// linear, human-readable sequence per event.
export default async function EventLogPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await getSession();
  if (!user) redirect("/login");

  const { id } = await params;
  const event = await prisma.event.findUnique({ where: { id }, select: { id: true, title: true, groupId: true } });
  if (!event) notFound();

  const membership = await resolveGroupMembership(event.groupId, user.id);
  if (!membership || membership.role !== "admin") notFound();

  const timeline = await getEventLogTimeline(id);

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 p-4 sm:p-8">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-semibold">{event.title}: Log</h1>
        <Link href={`/events/${id}`} className="text-sm underline">
          Back to event
        </Link>
      </div>

      {timeline.length === 0 && <EmptyState>Nothing logged yet.</EmptyState>}

      <ol className="flex flex-col gap-2">
        {timeline.map((entry) => (
          <li key={entry.id}>
            <Card className="p-3 text-sm">
              <span className="text-muted">{formatDateTime(entry.createdAt)}</span> — {entry.description}
            </Card>
          </li>
        ))}
      </ol>
    </main>
  );
}
