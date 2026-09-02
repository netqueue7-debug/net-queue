import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { needsOnboarding } from "@/lib/auth/onboarding";
import { resolveGroupMembership } from "@/lib/groups/authz";
import { listActiveMemberships, listPendingMemberships } from "@/lib/groups/groups";
import { ApproveRejectButtons } from "./approve-reject-buttons";
import { RoleToggleButton } from "./role-toggle-button";
import { BanUnbanButton } from "./ban-unban-button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";

export default async function GroupMembershipsPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await getSession();
  if (!user) redirect("/login");
  if (needsOnboarding(user)) redirect("/onboarding");

  const { id } = await params;
  const membership = await resolveGroupMembership(id, user.id);
  if (!membership || membership.role !== "admin") notFound();

  const [pending, active] = await Promise.all([listPendingMemberships(id), listActiveMemberships(id)]);

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-8 p-4 sm:p-8">
      <section className="flex flex-col gap-3">
        <h1 className="text-2xl font-semibold">Pending members</h1>

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
