import { prisma } from "@/lib/db";
import { enqueueNotification, dispatchNotifications } from "@/lib/notifications/notifications";
import { assertGroupAdmin } from "@/lib/groups/authz";
import { getGroupOrThrow } from "@/lib/groups/groups";
import { UpgradeRequestNotFoundError, UpgradeRequestAlreadyPendingError } from "./errors";
import type { GroupUpgradeRequest, GroupUpgradeRequestStatus } from "@/lib/generated/prisma/client";

export interface CreateUpgradeRequestInput {
  requestedLimit?: number | null;
  message?: string | null;
}

// Group-admin-only (a platform admin has no reason to file one — they can
// just set the limit themselves via setGroupMemberLimit). One open request
// per group at a time so the platform admin's queue doesn't fill with
// duplicates of the same ask.
export async function requestGroupUpgrade(
  groupId: string,
  userId: string,
  input: CreateUpgradeRequestInput,
): Promise<GroupUpgradeRequest> {
  await assertGroupAdmin(groupId, userId);
  const group = await getGroupOrThrow(groupId);

  const existingPending = await prisma.groupUpgradeRequest.findFirst({
    where: { groupId, status: "pending" },
  });
  if (existingPending) throw new UpgradeRequestAlreadyPendingError();

  const platformAdmins = await prisma.user.findMany({ where: { role: "admin" }, select: { id: true } });

  let notificationIds: string[] = [];
  const request = await prisma.$transaction(async (tx) => {
    const request = await tx.groupUpgradeRequest.create({
      data: {
        groupId,
        requestedBy: userId,
        requestedLimit: input.requestedLimit ?? null,
        message: input.message?.trim() || null,
      },
    });
    const notifications = await Promise.all(
      platformAdmins.map((admin) =>
        enqueueNotification(tx, {
          userId: admin.id,
          eventId: null,
          type: "group_upgrade_requested",
          payload: { groupId, groupName: group.name, requestId: request.id, requestedLimit: request.requestedLimit },
        }),
      ),
    );
    notificationIds = notifications.map((n) => n.id);
    return request;
  });
  await dispatchNotifications(notificationIds);
  return request;
}

// For the member-side "at capacity" UI — lets a group admin see they
// already have one outstanding instead of re-submitting.
export function getPendingUpgradeRequestForGroup(groupId: string): Promise<GroupUpgradeRequest | null> {
  return prisma.groupUpgradeRequest.findFirst({
    where: { groupId, status: "pending" },
    orderBy: { createdAt: "desc" },
  });
}

export interface UpgradeRequestItem {
  id: string;
  groupId: string;
  groupName: string;
  requestedByDisplayName: string | null;
  requestedLimit: number | null;
  message: string | null;
  status: GroupUpgradeRequestStatus;
  currentMemberLimit: number | null;
  activeMemberCount: number;
  createdAt: string;
  resolvedAt: string | null;
}

// Platform-admin only, every group's requests — mirrors
// lib/feedback/feedback.ts#listFeedback (not group-scoped from the
// caller's perspective: this *is* the cross-group admin view).
export async function listUpgradeRequests(): Promise<UpgradeRequestItem[]> {
  const rows = await prisma.groupUpgradeRequest.findMany({
    orderBy: [{ status: "asc" }, { createdAt: "desc" }], // "pending" sorts before "approved"/"denied" — enum declaration order
    include: {
      group: { select: { name: true, memberLimit: true, id: true } },
      requester: { select: { displayName: true } },
    },
  });

  const activeCounts = await prisma.groupMembership.groupBy({
    by: ["groupId"],
    where: { groupId: { in: rows.map((r) => r.groupId) }, status: "active" },
    _count: { _all: true },
  });
  const activeCountByGroupId = new Map(activeCounts.map((c) => [c.groupId, c._count._all]));

  return rows.map((r) => ({
    id: r.id,
    groupId: r.groupId,
    groupName: r.group.name,
    requestedByDisplayName: r.requester.displayName,
    requestedLimit: r.requestedLimit,
    message: r.message,
    status: r.status,
    currentMemberLimit: r.group.memberLimit,
    activeMemberCount: activeCountByGroupId.get(r.groupId) ?? 0,
    createdAt: r.createdAt.toISOString(),
    resolvedAt: r.resolvedAt ? r.resolvedAt.toISOString() : null,
  }));
}

export function getPendingUpgradeRequestCount(): Promise<number> {
  return prisma.groupUpgradeRequest.count({ where: { status: "pending" } });
}

export interface ResolveUpgradeRequestInput {
  decision: "approved" | "denied";
  // Only applied when decision is "approved". Omitted/null leaves the
  // group's memberLimit untouched (approving without changing the number
  // is a valid outcome, e.g. "already raised it separately").
  newLimit?: number | null;
}

export async function resolveUpgradeRequest(
  requestId: string,
  platformAdminId: string,
  input: ResolveUpgradeRequestInput,
): Promise<GroupUpgradeRequest> {
  const existing = await prisma.groupUpgradeRequest.findUnique({ where: { id: requestId } });
  if (!existing) throw new UpgradeRequestNotFoundError();
  const group = await getGroupOrThrow(existing.groupId);

  let notificationId = "";
  const request = await prisma.$transaction(async (tx) => {
    if (input.decision === "approved" && input.newLimit !== undefined) {
      await tx.group.update({ where: { id: existing.groupId }, data: { memberLimit: input.newLimit } });
    }
    const request = await tx.groupUpgradeRequest.update({
      where: { id: requestId },
      data: { status: input.decision, resolvedAt: new Date(), resolvedBy: platformAdminId },
    });
    const notification = await enqueueNotification(tx, {
      userId: existing.requestedBy,
      eventId: null,
      type: "group_upgrade_resolved",
      payload: {
        groupId: existing.groupId,
        groupName: group.name,
        decision: input.decision,
        newLimit: input.decision === "approved" ? (input.newLimit ?? null) : null,
      },
    });
    notificationId = notification.id;
    return request;
  });
  await dispatchNotifications([notificationId]);
  return request;
}
