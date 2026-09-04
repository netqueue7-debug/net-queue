import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { needsOnboarding } from "@/lib/auth/onboarding";
import { resolveGroupMembership } from "@/lib/groups/authz";
import { getGroupOrThrow, listPublicMembers, listPendingMemberships, listActiveMemberships } from "@/lib/groups/groups";
import { GroupNotFoundError } from "@/lib/groups/errors";
import { ApproveRejectButtons } from "./approve-reject-buttons";
import { RoleToggleButton } from "./role-toggle-button";
import { BanUnbanButton } from "./ban-unban-button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";

export default async function GroupMembersPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await getSession();
  if (!user) redirect("/login");
  if (needsOnboarding(user)) redirect("/onboarding");

  const { id } = await params;

  // resolveGroupMembership honors the platform-admin override (policy.md#6),
  // same gate as the group calendar page — must be an active member (or
  // platform admin) to see the roster at all.
  const membership = await resolveGroupMembership(id, user.id);
  if (!membership) notFound();

  let group;
  try {
    group = await getGroupOrThrow(id);
  } catch (e) {
    if (e instanceof GroupNotFoundError) notFound();
    throw e;
  }

  const header = (
    <div>
      <Link href="/groups" className="text-sm text-muted hover:underline">
        ← Your groups
      </Link>
      <h1 className="text-2xl font-semibold">{group.name}: Members</h1>
    </div>
  );

  // A plain member only ever sees the active roster, no phone/pending/
  // banned fields — same principle as listPublicMembers' own comment.
  // Admins (a real group admin, or a platform admin via the override above)
  // get the fuller view: pending join requests to approve/reject, plus
  // role and ban controls over active members.
  if (membership.role !== "admin") {
    const members = await listPublicMembers(id);
    return (
      <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 p-4 sm:p-8">
        {header}

        {members.length === 0 && <EmptyState>No active members yet.</EmptyState>}

        <ul className="flex flex-col gap-2">
          {members.map((m) => (
            <li key={m.userId}>
              <Card className="flex items-center justify-between gap-2 p-3">
                <span className="font-medium">{m.displayName ?? "Member"}</span>
                {m.role === "admin" && <Badge tone="info">Admin</Badge>}
              </Card>
            </li>
          ))}
        </ul>
      </main>
    );
  }

  const [pending, active] = await Promise.all([listPendingMemberships(id), listActiveMemberships(id)]);

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-8 p-4 sm:p-8">
      {header}

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-medium">Pending members</h2>

        {pending.length === 0 && <EmptyState>No pending join requests.</EmptyState>}

        <ul className="flex flex-col gap-2">
          {pending.map((m) => (
            <li key={m.userId}>
              <Card className="flex flex-wrap items-center justify-between gap-2 p-3">
                <span>{m.user.displayName ?? m.user.phone}</span>
                <ApproveRejectButtons groupId={id} userId={m.userId} />
              </Card>
            </li>
          ))}
        </ul>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-medium">Members</h2>

        <ul className="flex flex-col gap-2">
          {active.map((m) => (
            <li key={m.userId}>
              <Card className="flex flex-wrap items-center justify-between gap-2 p-3">
                <span>
                  <Link href={`/admin/groups/${id}/members/${m.userId}`} className="underline">
                    {m.user.displayName ?? m.user.phone}
                  </Link>
                  <span className="ml-2 text-sm text-muted">({m.role})</span>
                  {m.user.bannedAt && <span className="ml-2 text-sm text-danger">banned</span>}
                </span>
                <div className="flex items-center gap-3">
                  <RoleToggleButton groupId={id} userId={m.userId} role={m.role} />
                  <BanUnbanButton userId={m.userId} banned={!!m.user.bannedAt} />
                </div>
              </Card>
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
