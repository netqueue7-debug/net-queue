// Counts pending + approved against `max_guests_per_rsvp` (policy.md#3) —
// admin-added guests are exempt and never hit this (lib/guests/guests.ts#adminAddGuests).
export class GuestCapExceededError extends Error {
  constructor(maxGuestsPerRsvp: number, existingCount: number) {
    const remaining = Math.max(0, maxGuestsPerRsvp - existingCount);
    const guestWord = (n: number) => (n === 1 ? "guest" : "guests");
    super(
      remaining > 0
        ? `You can add at most ${remaining} more ${guestWord(remaining)} (limit is ${maxGuestsPerRsvp} ${guestWord(maxGuestsPerRsvp)} per RSVP).`
        : `You've already reached the limit of ${maxGuestsPerRsvp} ${guestWord(maxGuestsPerRsvp)} per RSVP.`,
    );
    this.name = "GuestCapExceededError";
  }
}

export class GuestNotFoundError extends Error {
  constructor() {
    super("Guest not found.");
    this.name = "GuestNotFoundError";
  }
}
