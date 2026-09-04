import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { listAllGroups, listMyMemberships, getActiveMemberCounts, getPendingMembershipCounts } from "@/lib/groups/groups";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Badge } from "@/components/ui/badge";
import { JoinAsAdminButton } from "./join-as-admin-button";
import { MemberLimitEditor } from "./member-limit-editor";

// Platform-admin only — see docs/policy.md#6. A group admin manages their
// own group(s) from /groups and /admin/events; this page is the "every
// group in the system" view, which only makes sense for the tier with full
// control over all of them.
export default async function AdminGroupsPage() {
  const user = await getSession();
  if (!user) redirect("/login");
  if (user.role !== "admin") redirect("/home");

  const [groups, myMemberships] = await Promise.all([listAllGroups(), listMyMemberships(user.id)]);
  // A platform admin's group-wide authority is otherwise virtual (never a
  // real row — lib/groups/authz.ts#resolveGroupMembership) so this page
  // needs its own real-membership lookup to know when "Join as admin" is
  // still meaningful versus already done.
  const myRoleByGroup = new Map(myMemberships.map((m) => [m.group.id, m]));
  const groupIds = groups.map((g) => g.id);
  const [activeMemberCounts, pendingMembershipCounts] = await Promise.all([
    getActiveMemberCounts(groupIds),
    getPendingMembershipCounts(groupIds),
  ]);

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 p-4 sm:p-8">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-semibold">All groups</h1>
        <Link
          href="/admin/groups/new"
          className="inline-flex items-center justify-center rounded bg-foreground px-4 py-2 text-sm font-medium text-background hover:opacity-90"
        >
          Create group
        </Link>
      </div>

      {groups.length === 0 && <EmptyState>No groups yet.</EmptyState>}

      <ul className="flex flex-col gap-2">
        {groups.map((group) => {
          const mine = myRoleByGroup.get(group.id);
          const isActiveAdmin = mine?.status === "active" && mine.role === "admin";
          const pendingCount = pendingMembershipCounts.get(group.id) ?? 0;

          return (
            <li key={group.id}>
              <Card className="p-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium">{group.name}</span>
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-muted">{group.joinPolicy}</span>
                    {isActiveAdmin && <Badge tone="info">You&apos;re an admin</Badge>}
                  </div>
                </div>
                <div className="mt-2 flex items-center justify-between gap-2">
                  <div className="flex gap-3 text-sm">
                    <Link href={`/admin/groups/${group.id}/events`} className="underline">
                      Events
                    </Link>
                    <Link href={`/admin/groups/${group.id}/dashboard`} className="underline">
                      Dashboard
                    </Link>
                    <Link href={`/groups/${group.id}/members`} className="underline">
                      Pending members{pendingCount > 0 ? ` (${pendingCount})` : ""}
                    </Link>
                  </div>
                  {!isActiveAdmin && <JoinAsAdminButton groupId={group.id} />}
                </div>
                <div className="mt-2">
                  <MemberLimitEditor
                    groupId={group.id}
                    activeMemberCount={activeMemberCounts.get(group.id) ?? 0}
                    initialLimit={group.memberLimit}
                  />
                </div>
              </Card>
            </li>
          );
        })}
      </ul>
    </main>
  );
}
