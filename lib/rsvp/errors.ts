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
