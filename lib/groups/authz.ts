import { prisma } from "@/lib/db";
import { requireMember, ForbiddenError } from "@/lib/auth/session";
import type { GroupMembership, User } from "@/lib/generated/prisma/client";
import type { NextRequest } from "next/server";

// architecture.md#groups--tenancy / policy.md#6: two tiers. A **platform
// admin** (`users.role === "admin"`) has full administrative control over
// *every* group — a real membership row is not required. A **group admin**
// (`group_memberships.role === "admin"`) is scoped to only their own
// group(s). Platform admin is the rare, ops-level "break glass" tier;
// day-to-day group management is done by group admins.
export async function getActiveMembership(groupId: string, userId: string): Promise<GroupMembership | null> {
  const membership = await prisma.groupMembership.findUnique({
    where: { groupId_userId: { groupId, userId } },
  });
  return membership && membership.status === "active" ? membership : null;
}

// A membership row that doesn't exist in the DB — returned for a platform
// admin acting on a group they aren't a member of, so every caller that
// already reads `.role`/`.status` off a membership (viewerRole, phone
// visibility, etc.) keeps working without a separate "or platform admin"
// branch at every call site.
function syntheticAdminMembership(groupId: string, userId: string): GroupMembership {
  return {
    id: "platform-admin-override",
    groupId,
    userId,
    role: "admin",
    status: "active",
    groupWaiverAcceptedAt: null,
    groupWaiverVersionAccepted: null,
    joinedAt: new Date(0),
  };
}

// Real membership if one exists; otherwise a synthetic admin membership if
// the user is a platform admin; otherwise null. This is the single place
// that implements the platform-admin override — every group-authz check
// below goes through it.
export async function resolveGroupMembership(groupId: string, userId: string): Promise<GroupMembership | null> {
  const membership = await getActiveMembership(groupId, userId);
  if (membership) return membership;

  const user = await prisma.user.findUnique({ where: { id: userId }, select: { role: true } });
  if (user?.role === "admin") return syntheticAdminMembership(groupId, userId);

  return null;
}

// Every group a user can currently see anything in — the basis for scoping
// any "list across my groups" read (e.g. the member event feed).
export async function getActiveGroupIds(userId: string): Promise<string[]> {
  const memberships = await prisma.groupMembership.findMany({
    where: { userId, status: "active" },
    select: { groupId: true },
  });
  return memberships.map((m) => m.groupId);
}

// Every group this user is a real, active *admin* of (not the
// platform-admin override — that's served separately by /admin/groups,
// which lists every group in the system). The basis for the /admin/events
// picker: zero groups, exactly one (skip the picker), or several (ask).
export async function getAdminGroupIds(userId: string): Promise<string[]> {
  const memberships = await prisma.groupMembership.findMany({
    where: { userId, role: "admin", status: "active" },
    orderBy: { joinedAt: "asc" },
    select: { groupId: true },
  });
  return memberships.map((m) => m.groupId);
}

// Convenience for the single-group case — the first (earliest-joined)
// group this user administers, or null if they administer none.
export async function getDefaultAdminGroupId(userId: string): Promise<string | null> {
  const [first] = await getAdminGroupIds(userId);
  return first ?? null;
}

// Pure membership checks against an already-resolved user id — use these
// when the route needs to check authentication (401) before it has even
// parsed/validated a body containing the target groupId (400 vs 401/403
// ordering matters: an unauthenticated caller should get 401 regardless of
// whether their body happens to be well-formed). Both honor the platform-
// admin override via resolveGroupMembership.
export async function assertGroupMember(groupId: string, userId: string): Promise<GroupMembership> {
  const membership = await resolveGroupMembership(groupId, userId);
  if (!membership) throw new ForbiddenError();
  return membership;
}

export async function assertGroupAdmin(groupId: string, userId: string): Promise<GroupMembership> {
  const membership = await assertGroupMember(groupId, userId);
  if (membership.role !== "admin") throw new ForbiddenError();
  return membership;
}

// Convenience wrappers that also resolve the session — fine when the route
// already knows groupId before needing the user (e.g. it's in the URL path,
// not the body).
export async function requireGroupMember(
  groupId: string,
  request?: NextRequest,
): Promise<{ user: User; membership: GroupMembership }> {
  const user = await requireMember(request);
  const membership = await assertGroupMember(groupId, user.id);
  return { user, membership };
}

export async function requireGroupAdmin(
  groupId: string,
  request?: NextRequest,
): Promise<{ user: User; membership: GroupMembership }> {
  const result = await requireGroupMember(groupId, request);
  if (result.membership.role !== "admin") throw new ForbiddenError();
  return result;
}

// A platform admin can moderate anyone. Otherwise, `actorId` must be an
// active admin of at least one group `targetUserId` is an active member of
// — moderation (ban/unban) isn't scoped to a single group's data the way
// most admin actions are (`banned_at` is global, docs/phase-0b-groups.md),
// but it still shouldn't be exercisable by a group admin with zero
// relationship to the target user.
export async function assertCanModerateUser(actorId: string, targetUserId: string): Promise<void> {
  const actor = await prisma.user.findUnique({ where: { id: actorId }, select: { role: true } });
  if (actor?.role === "admin") return;

  const sharedGroup = await prisma.groupMembership.findFirst({
    where: {
      userId: actorId,
      role: "admin",
      status: "active",
      group: { memberships: { some: { userId: targetUserId, status: "active" } } },
    },
  });
  if (!sharedGroup) throw new ForbiddenError();
}
