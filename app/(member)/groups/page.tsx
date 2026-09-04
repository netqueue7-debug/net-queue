import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { needsOnboarding } from "@/lib/auth/onboarding";
import { listMyMemberships, getPendingMembershipCounts } from "@/lib/groups/groups";
import { JoinGroupForm } from "./join-group-form";
import { GroupsList, type GroupCardData } from "./groups-list";
import { EmptyState } from "@/components/ui/empty-state";

export default async function GroupsPage() {
  const user = await getSession();
  if (!user) redirect("/login");
  if (needsOnboarding(user)) redirect("/onboarding");

  const memberships = await listMyMemberships(user.id);

  // Only groups this user actually administers need the pending-count
  // query — a plain member never sees other members' pending requests.
  const adminGroupIds = memberships.filter((m) => m.role === "admin" && m.status === "active").map((m) => m.group.id);
  const pendingCounts = adminGroupIds.length > 0 ? await getPendingMembershipCounts(adminGroupIds) : new Map<string, number>();

  const hdrs = await headers();
  const host = hdrs.get("host");
  const proto = hdrs.get("x-forwarded-proto") ?? (host?.startsWith("localhost") ? "http" : "https");
  const origin = host ? `${proto}://${host}` : "";

  // Explicit plain-data shape, not the raw membership/group rows — those
  // carry Date fields (e.g. Group.createdAt) that have no business crossing
  // into GroupsList (a Client Component).
  const cards: GroupCardData[] = memberships.map((m) => ({
    groupId: m.group.id,
    name: m.group.name,
    imageUrl: m.group.imageUrl,
    joinCode: m.group.joinCode,
    memberLimit: m.group.memberLimit,
    role: m.role,
    status: m.status,
    activeMemberCount: m.activeMemberCount,
    pendingMemberCount: pendingCounts.get(m.group.id) ?? 0,
    waiverUpToDate: m.waiverUpToDate,
  }));

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 p-4 sm:p-8">
      <h1 className="text-2xl font-semibold">Your groups</h1>

      {memberships.length === 0 && (
        <EmptyState>You&apos;re not in any groups yet. Ask whoever runs your group for a join link or code.</EmptyState>
      )}

      <GroupsList initialCards={cards} origin={origin} />

      <div>
        <h2 className="mb-2 text-lg font-medium">Join a group</h2>
        <JoinGroupForm />
      </div>
    </main>
  );
}
