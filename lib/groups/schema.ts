import { z } from "zod";

export const createGroupSchema = z.object({
  name: z.string().trim().min(1).max(200),
  joinPolicy: z.enum(["open", "approval"]),
  adminPhone: z.string().min(1),
});

export const updateGroupSchema = z
  .object({
    name: z.string().trim().min(1).max(200),
    description: z.string().trim().max(2000).nullable(),
    joinPolicy: z.enum(["open", "approval"]),
    // Version bump on change is derived server-side — see
    // lib/groups/groups.ts#updateGroup — never accepted directly from a
    // client here, so a version can't be bumped without a real content change.
    waiverContent: z.string().trim().max(20000).nullable(),
  })
  .partial();

export const joinGroupSchema = z.object({
  code: z.string().min(1),
});

export const updateMembershipRoleSchema = z.object({
  role: z.enum(["member", "admin"]),
});

export const reorderMembershipsSchema = z.object({
  groupIds: z.array(z.string().min(1)).min(1),
});

// Deliberately its own schema/endpoint, not folded into updateGroupSchema —
// that route only requires group-admin, and a group admin raising their
// own member limit would defeat the point (platform-admin-only, see
// PATCH /api/groups/[id]/member-limit).
export const updateMemberLimitSchema = z.object({
  memberLimit: z.number().int().positive().nullable(),
});
