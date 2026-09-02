// Thrown for both a nonexistent event id and an event whose group the
// caller has no active membership in — deliberately the same error/message
// for both, so a probe against another group's event id can't distinguish
// "doesn't exist" from "exists but you can't see it" (architecture.md#groups--tenancy).
export class EventNotFoundError extends Error {
  constructor() {
    super("Event not found.");
    this.name = "EventNotFoundError";
  }
}

export class SignupNotOpenError extends Error {
  constructor() {
    super("Signup hasn't opened for this event yet.");
    this.name = "SignupNotOpenError";
  }
}

export class EventCanceledError extends Error {
  constructor() {
    super("This event has been canceled.");
    this.name = "EventCanceledError";
  }
}

export class UserBannedError extends Error {
  constructor() {
    super("This account can't RSVP.");
    this.name = "UserBannedError";
  }
}

export class WaiverNotAcceptedError extends Error {
  constructor() {
    super("You need to accept the current waiver before RSVPing.");
    this.name = "WaiverNotAcceptedError";
  }
}

// Distinct from WaiverNotAcceptedError (the platform waiver) — this is the
// group's own waiver, required only when the event/series opts in via
// `waiverRequired` (architecture.md#groups--tenancy, policy.md#6).
export class GroupWaiverNotAcceptedError extends Error {
  constructor() {
    super("You need to accept this group's waiver before RSVPing.");
    this.name = "GroupWaiverNotAcceptedError";
  }
}

export class AlreadyRsvpedError extends Error {
  constructor() {
    super("You already have an active RSVP for this event.");
    this.name = "AlreadyRsvpedError";
  }
}

export class RsvpNotFoundError extends Error {
  constructor() {
    super("RSVP not found.");
    this.name = "RsvpNotFoundError";
  }
}
