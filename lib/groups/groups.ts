import { randomBytes } from "node:crypto";
import { prisma } from "@/lib/db";
import { normalizeUsPhone } from "@/lib/auth/otp";
import { enqueueNotification } from "@/lib/notifications/notifications";
import { getAdminGroupIds } from "@/lib/groups/authz";
import {
  GroupNotFoundError,
  GroupWaiverNotConfiguredError,
  GroupMemberLimitReachedError,
  InvalidJoinCodeError,
  LastAdminError,
  MembershipNotFoundError,
} from "./errors";
import type { Group, GroupMembership } from "@/lib/generated/prisma/client";

function generateJoinCode(): string {
  // Same entropy bar as Phase 2's planned guest waiver tokens (architecture.md).
  return randomBytes(24).toString("base64url");
}

export interface CreateGroupInput {
  name: string;
  joinPolicy: "open" | "approval";
  // Phone of the user to install as the group's first admin — group
  // creation is platform-admin-only and not self-serve (policy.md#6), so
  // the creator (a platform admin) and the group's actual admin are
  // usually different people.
  adminPhone: string;
}

// `createdBy` records which platform admin ran this (an audit trail, per
// architecture.md), not necessarily a member of the new group themselves.
export async function createGroup(platformAdminId: string, input: CreateGroupInput): Promise<Group> {
  const phone = normalizeUsPhone(input.adminPhone);
  const groupAdmin = await prisma.user.upsert({
    where: { phone },
    update: {},
    create: { phone },
  });

  const group = await prisma.group.create({
    data: {
      name: input.name,
      joinPolicy: input.joinPolicy,
      joinCode: generateJoinCode(),
      createdBy: platformAdminId,
    },
  });

  // No join code / approval step for the admin installed at creation time —
  // per docs/phase-0b-groups.md, this is a direct install, not a join.
  await prisma.groupMembership.create({
    data: { groupId: group.id, userId: groupAdmin.id, role: "admin", status: "active" },
  });

  return group;
}

export interface UpdateGroupInput {
  name?: string;
  description?: string | null;
  joinPolicy?: "open" | "approval";
  waiverContent?: string | null;
}

// `waiverVersion` is never set directly by a caller — it's derived here,
// bumped only when `waiverContent` actually changes, so editing the waiver
// re-prompts every member of this group to re-accept
// (architecture.md#groups--tenancy) without an admin having to remember to
// do it themselves. Clearing the content (null) clears the version too —
// no waiver configured means nothing to accept.
export async function updateGroup(groupId: string, input: UpdateGroupInput): Promise<Group> {
  if (input.waiverContent === undefined) {
    return prisma.group.update({ where: { id: groupId }, data: input });
  }

  const current = await getGroupOrThrow(groupId);
  const contentChanged = input.waiverContent !== current.waiverContent;
  const waiverVersion = !contentChanged
    ? current.waiverVersion
    : input.waiverContent === null
      ? null
      : (current.waiverVersion ?? 0) + 1;

  return prisma.group.update({ where: { id: groupId }, data: { ...input, waiverVersion } });
}

export async function rotateJoinCode(groupId: string): Promise<Group> {
  return prisma.group.update({ where: { id: groupId }, data: { joinCode: generateJoinCode() } });
}

// Platform-admin-only (enforced by the route, not here — see
// lib/groups/schema.ts#updateMemberLimitSchema). Lowering it below the
// current active count doesn't remove anyone; it just blocks the next
// join/approval until membership drops back under it or the limit is
// raised again.
export function setGroupMemberLimit(groupId: string, memberLimit: number | null): Promise<Group> {
  return prisma.group.update({ where: { id: groupId }, data: { memberLimit } });
}

export function getActiveMemberCount(groupId: string): Promise<number> {
  return prisma.groupMembership.count({ where: { groupId, status: "active" } });
}

export async function getActiveMemberCounts(groupIds: string[]): Promise<Map<string, number>> {
  const counts = await prisma.groupMembership.groupBy({
    by: ["groupId"],
    where: { groupId: { in: groupIds }, status: "active" },
    _count: { _all: true },
  });
  return new Map(counts.map((c) => [c.groupId, c._count._all]));
}

export async function getPendingMembershipCounts(groupIds: string[]): Promise<Map<string, number>> {
  const counts = await prisma.groupMembership.groupBy({
    by: ["groupId"],
    where: { groupId: { in: groupIds }, status: "pending" },
    _count: { _all: true },
  });
  return new Map(counts.map((c) => [c.groupId, c._count._all]));
}

// Nav-badge total (docs/policy.md#6's per-group admin boundary): a platform
// admin sees every group's queue, since their control is system-wide with
// no membership rows of their own to scope by; a real group admin sees only
// the groups they actually administer (getAdminGroupIds).
export async function getPendingMembershipCountForAdmin(userId: string, isPlatformAdmin: boolean): Promise<number> {
  if (isPlatformAdmin) {
    return prisma.groupMembership.count({ where: { status: "pending" } });
  }
  const groupIds = await getAdminGroupIds(userId);
  if (groupIds.length === 0) return 0;
  return prisma.groupMembership.count({ where: { groupId: { in: groupIds }, status: "pending" } });
}

async function assertUnderMemberLimit(group: Group): Promise<void> {
  if (group.memberLimit === null) return;
  const activeCount = await getActiveMemberCount(group.id);
  if (activeCount >= group.memberLimit) throw new GroupMemberLimitReachedError();
}

export interface JoinResult {
  group: Group;
  membership: GroupMembership;
}

// Idempotent by design (policy.md#6): a repeat submission of the same code
// updates the existing row rather than erroring or duplicating. An
// already-`active` membership is left untouched (including its role — a
// group admin who "joins again" is not silently demoted to member).
export async function joinGroupByCode(userId: string, joinCode: string): Promise<JoinResult> {
  const group = await prisma.group.findUnique({ where: { joinCode } });
  if (!group) throw new InvalidJoinCodeError();

  const existing = await prisma.groupMembership.findUnique({
    where: { groupId_userId: { groupId: group.id, userId } },
  });

  if (existing) {
    if (existing.status === "active") return { group, membership: existing };
    const status = group.joinPolicy === "open" ? "active" : "pending";
    if (status === "active") await assertUnderMemberLimit(group);
    const membership = await prisma.groupMembership.update({
      where: { id: existing.id },
      data: { status },
    });
    return { group, membership };
  }

  const status = group.joinPolicy === "open" ? "active" : "pending";
  if (status === "active") await assertUnderMemberLimit(group);
  const membership = await prisma.groupMembership.create({
    data: { groupId: group.id, userId, role: "member", status },
  });
  return { group, membership };
}

export interface MyGroupMembership {
  group: Group;
  role: "member" | "admin";
  status: "active" | "pending" | "rejected";
  // Whether *this* group's own waiver (not the platform one) is up to
  // date — always false when the group has no waiver configured, since
  // there's nothing to accept.
  waiverUpToDate: boolean;
  // Current active member count, for rendering "at its limit" state next
  // to the invite link — one grouped count query, not one per membership.
  activeMemberCount: number;
}

export async function listMyMemberships(userId: string): Promise<MyGroupMembership[]> {
  const memberships = await prisma.groupMembership.findMany({
    where: { userId },
    include: { group: true },
    orderBy: [{ sortOrder: "asc" }, { joinedAt: "asc" }],
  });

  const countByGroupId = await getActiveMemberCounts(memberships.map((m) => m.groupId));

  return memberships.map((m) => ({
    group: m.group,
    role: m.role,
    status: m.status,
    waiverUpToDate: m.group.waiverVersion === null || m.groupWaiverVersionAccepted === m.group.waiverVersion,
    activeMemberCount: countByGroupId.get(m.groupId) ?? 0,
  }));
}

// `groupIds` must be exactly the caller's own membership group ids, just
// reordered — anything missing or extra is rejected rather than silently
// reconciled, since a partial list would leave stale sortOrder gaps and
// there's no legitimate client reason to send anything else.
export async function reorderMyMemberships(userId: string, groupIds: string[]): Promise<void> {
  const memberships = await prisma.groupMembership.findMany({
    where: { userId },
    select: { id: true, groupId: true },
  });

  const membershipIdByGroupId = new Map(memberships.map((m) => [m.groupId, m.id]));
  const isExactReorder = groupIds.length === memberships.length && groupIds.every((id) => membershipIdByGroupId.has(id));
  if (!isExactReorder) throw new MembershipNotFoundError();

  await prisma.$transaction(
    groupIds.map((groupId, index) =>
      prisma.groupMembership.update({
        where: { id: membershipIdByGroupId.get(groupId)! },
        data: { sortOrder: index },
      }),
    ),
  );
}

export async function listPendingMemberships(groupId: string) {
  return prisma.groupMembership.findMany({
    where: { groupId, status: "pending" },
    include: { user: { select: { id: true, displayName: true, phone: true } } },
    orderBy: { joinedAt: "asc" },
  });
}

export async function listActiveMemberships(groupId: string) {
  return prisma.groupMembership.findMany({
    where: { groupId, status: "active" },
    include: { user: { select: { id: true, displayName: true, phone: true, bannedAt: true } } },
    orderBy: { joinedAt: "asc" },
  });
}

export interface PublicMember {
  userId: string;
  displayName: string | null;
  role: "member" | "admin";
}

// Member-facing roster (/groups/:id/members) — deliberately a separate,
// narrower query from listActiveMemberships rather than that function with
// fields stripped in the view layer: phone numbers are never fetched here
// at all, not just hidden, same principle as lib/rsvp/event-detail.ts's
// RsvpListItem no longer carrying phone. No bannedAt either — that's an
// admin-moderation concern, not something a plain member should see.
export async function listPublicMembers(groupId: string): Promise<PublicMember[]> {
  const memberships = await prisma.groupMembership.findMany({
    where: { groupId, status: "active" },
    include: { user: { select: { displayName: true } } },
    orderBy: { joinedAt: "asc" },
  });
  // Admins first, not DB enum declaration order — sorted here rather than
  // via Prisma orderBy so it doesn't silently depend on the order `member`/
  // `admin` happen to be declared in the GroupMembershipRole enum.
  return memberships
    .map((m) => ({ userId: m.userId, displayName: m.user.displayName, role: m.role }))
    .sort((a, b) => (a.role === b.role ? 0 : a.role === "admin" ? -1 : 1));
}

async function findMembershipOrThrow(groupId: string, userId: string): Promise<GroupMembership> {
  const membership = await prisma.groupMembership.findUnique({
    where: { groupId_userId: { groupId, userId } },
  });
  if (!membership) throw new MembershipNotFoundError();
  return membership;
}

// Stricter than findMembershipOrThrow: pending/rejected don't count. Used
// wherever "not yet approved" should look identical to "not a member at
// all" (the group waiver — nothing to accept until you're actually in).
async function findActiveMembershipOrThrow(groupId: string, userId: string): Promise<GroupMembership> {
  const membership = await findMembershipOrThrow(groupId, userId);
  if (membership.status !== "active") throw new MembershipNotFoundError();
  return membership;
}

export async function approveMembership(groupId: string, userId: string): Promise<GroupMembership> {
  await findMembershipOrThrow(groupId, userId);
  const group = await getGroupOrThrow(groupId);
  await assertUnderMemberLimit(group);
  return prisma.$transaction(async (tx) => {
    const membership = await tx.groupMembership.update({
      where: { groupId_userId: { groupId, userId } },
      data: { status: "active" },
    });
    await enqueueNotification(tx, {
      userId,
      eventId: null,
      type: "group_membership_approved",
      payload: { groupId, groupName: group.name },
    });
    return membership;
  });
}

// A rejected membership can be resubmitted via joinGroupByCode — this is
// not a permanent ban (policy.md#6's join-flow rule).
export async function rejectMembership(groupId: string, userId: string): Promise<GroupMembership> {
  await findMembershipOrThrow(groupId, userId);
  const group = await getGroupOrThrow(groupId);
  return prisma.$transaction(async (tx) => {
    const membership = await tx.groupMembership.update({
      where: { groupId_userId: { groupId, userId } },
      data: { status: "rejected" },
    });
    await enqueueNotification(tx, {
      userId,
      eventId: null,
      type: "group_membership_rejected",
      payload: { groupId, groupName: group.name },
    });
    return membership;
  });
}

// Promote/demote an *active* member's role within one group. Pending/
// rejected rows aren't eligible — approve them first (approveMembership).
export async function updateMembershipRole(
  groupId: string,
  userId: string,
  role: "member" | "admin",
): Promise<GroupMembership> {
  const membership = await findActiveMembershipOrThrow(groupId, userId);

  if (membership.role === "admin" && role === "member") {
    const otherActiveAdmins = await prisma.groupMembership.count({
      where: { groupId, role: "admin", status: "active", userId: { not: userId } },
    });
    if (otherActiveAdmins === 0) throw new LastAdminError();
  }

  return prisma.groupMembership.update({
    where: { groupId_userId: { groupId, userId } },
    data: { role },
  });
}

// Platform-admin only (there's no group-scoped equivalent — a group admin
// has no business seeing groups they don't belong to). Used by the "all
// groups" admin page, since a platform admin's full control over every
// group (policy.md#6) means they need a way to find groups they aren't
// personally a member of, not just the ones listMyMemberships would show.
export async function listAllGroups(): Promise<Group[]> {
  return prisma.group.findMany({ orderBy: { createdAt: "desc" } });
}

export async function getGroupOrThrow(groupId: string): Promise<Group> {
  const group = await prisma.group.findUnique({ where: { id: groupId } });
  if (!group) throw new GroupNotFoundError();
  return group;
}

// Platform-admin "break glass" self-join: bypasses the join code and
// approval policy entirely, and upgrades *any* existing row (pending,
// rejected, or a plain member) straight to active/admin. This turns a
// platform admin's virtual full-group-control (the synthetic override in
// lib/groups/authz.ts#resolveGroupMembership, which is never persisted and
// never shows up in a group's real roster) into a real, visible row —
// without needing a join code or another admin's approval. The route
// gates this with requireAdmin() (platform role), not assertGroupAdmin, so
// a real group-admin of an unrelated group can't use it to hop into groups
// they don't belong to.
export async function joinGroupAsPlatformAdmin(groupId: string, platformAdminId: string): Promise<GroupMembership> {
  await getGroupOrThrow(groupId);
  return prisma.groupMembership.upsert({
    where: { groupId_userId: { groupId, userId: platformAdminId } },
    update: { status: "active", role: "admin" },
    create: { groupId, userId: platformAdminId, role: "admin", status: "active" },
  });
}

// The group's own waiver — a second, independent acceptance from the
// platform waiver (architecture.md#groups--tenancy). `accepted` is false
// whenever the group has no waiver configured at all, same as "nothing to
// accept."
export async function getGroupWaiverStatus(
  groupId: string,
  userId: string,
): Promise<{ waiverContent: string | null; waiverVersion: number | null; accepted: boolean }> {
  const group = await getGroupOrThrow(groupId);
  const membership = await findActiveMembershipOrThrow(groupId, userId);
  const accepted =
    group.waiverVersion !== null && membership.groupWaiverVersionAccepted === group.waiverVersion;
  return { waiverContent: group.waiverContent, waiverVersion: group.waiverVersion, accepted };
}

export async function acceptGroupWaiver(groupId: string, userId: string, ip: string): Promise<void> {
  const group = await getGroupOrThrow(groupId);
  await findActiveMembershipOrThrow(groupId, userId);
  if (group.waiverVersion === null) throw new GroupWaiverNotConfiguredError();

  const signedAt = new Date();
  await prisma.$transaction([
    prisma.groupMembership.update({
      where: { groupId_userId: { groupId, userId } },
      data: { groupWaiverAcceptedAt: signedAt, groupWaiverVersionAccepted: group.waiverVersion },
    }),
    prisma.waiverSignature.create({
      data: { groupId, waiverVersion: group.waiverVersion, signerType: "user", userId, ip, signedAt },
    }),
  ]);
}
