export class GroupNotFoundError extends Error {
  constructor() {
    super("Group not found.");
    this.name = "GroupNotFoundError";
  }
}

export class InvalidJoinCodeError extends Error {
  constructor() {
    super("Invalid join code.");
    this.name = "InvalidJoinCodeError";
  }
}

export class MembershipNotFoundError extends Error {
  constructor() {
    super("Membership not found.");
    this.name = "MembershipNotFoundError";
  }
}

export class GroupWaiverNotConfiguredError extends Error {
  constructor() {
    super("This group has no waiver configured.");
    this.name = "GroupWaiverNotConfiguredError";
  }
}

// Demoting the group's only remaining active admin would leave it
// unmanageable by any group admin (a platform admin could still reach it
// via the override, but that's the rare "break glass" tier, not how a
// group should normally be run) — refuse rather than allow it silently.
export class LastAdminError extends Error {
  constructor() {
    super("This is the group's only admin — promote someone else first.");
    this.name = "LastAdminError";
  }
}

// Thrown at the moment a membership would actually become active (an
// open-policy join, or an admin approving a pending request) — not at
// request time, since a pending request is allowed to queue up past the
// limit (lib/groups/groups.ts#approveMembership/joinGroupByCode).
export class GroupMemberLimitReachedError extends Error {
  constructor() {
    super("This group is at its member limit. Contact an admin to increase it.");
    this.name = "GroupMemberLimitReachedError";
  }
}
