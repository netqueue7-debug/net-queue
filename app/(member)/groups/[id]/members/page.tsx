import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { needsOnboarding } from "@/lib/auth/onboarding";
import { resolveGroupMembership } from "@/lib/groups/authz";
import { getGroupOrThrow, listPublicMembers } from "@/lib/groups/groups";
import { GroupNotFoundError } from "@/lib/groups/errors";
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

  const members = await listPublicMembers(id);

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 p-4 sm:p-8">
      <div>
        <Link href="/groups" className="text-sm text-muted hover:underline">
          ← Your groups
        </Link>
        <h1 className="text-2xl font-semibold">{group.name}: Members</h1>
      </div>

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
