import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { listUpgradeRequests } from "@/lib/groups/upgrade-requests";
import { formatDateTime } from "@/lib/format-datetime";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Badge } from "@/components/ui/badge";
import { Linkify } from "@/components/ui/linkify";
import { ResolveUpgradeRequestActions } from "./resolve-upgrade-request-actions";

// Platform-admin only (policy.md#6) — raising a group's memberLimit is
// already platform-admin-only (lib/groups/groups.ts#setGroupMemberLimit),
// so the request queue that feeds into it is scoped the same way.
export default async function AdminGroupUpgradeRequestsPage() {
  const user = await getSession();
  if (!user) redirect("/login");
  if (user.role !== "admin") redirect("/home");

  const requests = await listUpgradeRequests();

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 p-4 sm:p-8">
      <h1 className="text-2xl font-semibold">Member limit requests</h1>

      {requests.length === 0 && <EmptyState>No requests yet.</EmptyState>}

      <ul className="flex flex-col gap-2">
        {requests.map((r) => (
          <li key={r.id}>
            <Card className="flex flex-col gap-2 p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="font-medium">{r.groupName}</span>
                  {r.status === "approved" && <Badge tone="success">Approved</Badge>}
                  {r.status === "denied" && <Badge tone="danger">Denied</Badge>}
                </div>
                <span className="text-sm text-muted">
                  {r.requestedByDisplayName ?? "Group admin"} · {formatDateTime(r.createdAt)}
                </span>
              </div>
              <p className="text-sm text-muted">
                Currently {r.activeMemberCount}
                {r.currentMemberLimit !== null ? `/${r.currentMemberLimit}` : ""} members
                {r.requestedLimit !== null && ` — requested limit: ${r.requestedLimit}`}
              </p>
              {r.message && (
                <p className="whitespace-pre-wrap text-sm">
                  <Linkify text={r.message} />
                </p>
              )}
              {r.status === "pending" && (
                <div className="flex justify-end">
                  <ResolveUpgradeRequestActions
                    requestId={r.id}
                    requestedLimit={r.requestedLimit}
                    currentMemberLimit={r.currentMemberLimit}
                  />
                </div>
              )}
            </Card>
          </li>
        ))}
      </ul>
    </main>
  );
}
