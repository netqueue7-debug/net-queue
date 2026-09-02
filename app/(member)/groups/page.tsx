import Link from "next/link";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { needsOnboarding } from "@/lib/auth/onboarding";
import { listMyMemberships } from "@/lib/groups/groups";
import { JoinGroupForm } from "./join-group-form";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { GroupCardHeader } from "@/components/ui/group-avatar";
import { CopyLinkChip } from "@/components/ui/copy-link-chip";
import { PlusIcon } from "@/components/ui/icons";

const createEventLinkClass =
  "flex items-center gap-1.5 rounded-md border border-accent/40 bg-accent/5 px-2.5 py-1.5 text-sm font-medium text-accent transition-colors hover:bg-accent/10";
const navLinkClass = "text-muted transition-colors hover:text-foreground hover:underline";

export default async function GroupsPage() {
  const user = await getSession();
  if (!user) redirect("/login");
  if (needsOnboarding(user)) redirect("/onboarding");

  const memberships = await listMyMemberships(user.id);

  const hdrs = await headers();
  const host = hdrs.get("host");
  const proto = hdrs.get("x-forwarded-proto") ?? (host?.startsWith("localhost") ? "http" : "https");
  const origin = host ? `${proto}://${host}` : "";

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 p-4 sm:p-8">
      <h1 className="text-2xl font-semibold">Your groups</h1>

      {memberships.length === 0 && (
        <EmptyState>You&apos;re not in any groups yet. Ask whoever runs your group for a join link or code.</EmptyState>
      )}

      <ul className="flex flex-col gap-3">
        {memberships.map((m) => (
          <li key={m.group.id}>
            <Card>
              <GroupCardHeader
                name={m.group.name}
                imageUrl={m.group.imageUrl}
                badge={
                  <Badge tone={m.status === "pending" ? "warning" : m.role === "admin" ? "info" : "neutral"}>
                    {m.status === "pending" ? "Pending" : m.role === "admin" ? "Admin" : "Member"}
                  </Badge>
                }
              />

              {m.status === "active" && m.role === "admin" && (
                <div className="mt-3">
                  <CopyLinkChip
                    label="Invite link"
                    link={`${origin}/join/${m.group.joinCode}`}
                    warning={
                      m.group.memberLimit !== null && m.activeMemberCount >= m.group.memberLimit
                        ? `This group is at its member limit (${m.activeMemberCount}/${m.group.memberLimit}) — new joins won't work until it's increased. Contact a platform admin to upgrade.`
                        : undefined
                    }
                  />
                </div>
              )}

              {m.status === "active" && (
                <div className="mt-3 flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
                    <Link href={`/groups/${m.group.id}/members`} className={navLinkClass}>
                      Members
                    </Link>
                    <span aria-hidden className="text-border">
                      ·
                    </span>
                    <Link href={`/groups/${m.group.id}/about`} className={navLinkClass}>
                      About
                    </Link>
                    <span aria-hidden className="text-border">
                      ·
                    </span>
                    <Link href={`/groups/${m.group.id}/calendar`} className={navLinkClass}>
                      Events
                    </Link>
                  </div>
                  {m.role === "admin" && (
                    <Link href={`/groups/${m.group.id}/calendar?new=1`} className={createEventLinkClass}>
                      <PlusIcon width={15} height={15} />
                      Create Event
                    </Link>
                  )}
                </div>
              )}

              {m.status === "active" && !m.waiverUpToDate && (
                <Link href={`/groups/${m.group.id}/waiver`} className="mt-3 block text-sm text-danger underline">
                  Outstanding waiver — accept it to RSVP to events that require it
                </Link>
              )}
            </Card>
          </li>
        ))}
      </ul>

      <div>
        <h2 className="mb-2 text-lg font-medium">Join a group</h2>
        <JoinGroupForm />
      </div>
    </main>
  );
}
