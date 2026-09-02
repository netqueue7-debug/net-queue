import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { getAdminGroupIds } from "@/lib/groups/authz";
import { prisma } from "@/lib/db";

// Entry point for "manage my group's events" — resolves to exactly where
// that means: skip straight to /admin/groups/:id/events for a single-group
// admin, offer a real picker for one who administers several (rather than
// silently guessing at "the" group), and point a platform admin with no
// group of their own at /admin/groups (every group in the system).
export default async function AdminEventsPage() {
  const user = await getSession();
  if (!user) redirect("/login");

  const groupIds = await getAdminGroupIds(user.id);

  if (groupIds.length === 1) redirect(`/admin/groups/${groupIds[0]}/events`);

  if (groupIds.length === 0) {
    return (
      <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-4 p-4 sm:p-8">
        <h1 className="text-2xl font-semibold">Admin: Events</h1>
        <p className="text-muted">
          {user.role === "admin" ? (
            <>
              You aren&apos;t a group admin of any group directly. Go to{" "}
              <Link href="/admin/groups" className="underline">
                all groups
              </Link>{" "}
              to manage any of them.
            </>
          ) : (
            "You aren't an admin of any group yet. A platform admin needs to set one up for you."
          )}
        </p>
      </main>
    );
  }

  const groups = await prisma.group.findMany({ where: { id: { in: groupIds } } });

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-4 p-4 sm:p-8">
      <h1 className="text-2xl font-semibold">Which group?</h1>
      <p className="text-muted">You administer more than one group — pick one to manage.</p>
      <ul className="flex flex-col gap-2">
        {groups.map((group) => (
          <li key={group.id}>
            <Link href={`/admin/groups/${group.id}/events`} className="underline">
              {group.name}
            </Link>
          </li>
        ))}
      </ul>
    </main>
  );
}
