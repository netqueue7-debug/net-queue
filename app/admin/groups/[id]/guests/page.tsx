import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { resolveGroupMembership } from "@/lib/groups/authz";
import { listPendingGuestsForGroup } from "@/lib/guests/guests";
import { ApproveRejectGuestButtons } from "./approve-reject-guest-buttons";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";

// The approval queue across every upcoming event in the group
// (docs/phase-2-recurrence-guests.md's "Admin: approval queue" task).
export default async function GroupGuestsPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await getSession();
  if (!user) redirect("/login");

  const { id } = await params;
  const membership = await resolveGroupMembership(id, user.id);
  if (!membership || membership.role !== "admin") notFound();

  const pending = await listPendingGuestsForGroup(id);

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 p-4 sm:p-8">
      <h1 className="text-2xl font-semibold">Pending guests</h1>

      {pending.length === 0 && <EmptyState>No pending guest requests.</EmptyState>}

      <ul className="flex flex-col gap-2">
        {pending.map((g) => (
          <li key={g.id}>
            <Card className="flex flex-wrap items-center justify-between gap-2 p-3">
              <div>
                <p>{g.name ?? "Unnamed guest"}</p>
                <p className="text-sm text-muted">
                  +1 for {g.rsvp.user.displayName ?? "a member"} at{" "}
                  <Link href={`/events/${g.rsvp.event.id}`} className="underline">
                    {g.rsvp.event.title}
                  </Link>{" "}
                  ({new Date(g.rsvp.event.startsAt).toLocaleDateString()})
                </p>
                <a href={`/waiver/${g.waiverToken}`} target="_blank" rel="noreferrer" className="text-sm underline">
                  Waiver link
                </a>
              </div>
              <ApproveRejectGuestButtons guestId={g.id} />
            </Card>
          </li>
        ))}
      </ul>
    </main>
  );
}
