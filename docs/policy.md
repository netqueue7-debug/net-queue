# Policy — settled business rules

These five rules are decided. They are not open for reinterpretation during implementation. When a requirement seems ambiguous, the answer is almost always here.

## 1. Parties are atomic, and the queue never skips

A host plus their approved guests occupy consecutive seats at the host's queue position. If the remaining seats can't fit the *whole* party, the entire party stays on the waitlist — and the queue does **not** skip ahead to a smaller party behind them.

Example: capacity 10, 9 seats consumed, next in queue is a party of 2, behind them a solo player. The party of 2 waits. The solo player also waits. The 10th seat stays empty until someone ahead cancels or capacity changes.

Rationale: skipping breaks the first-come-first-served promise and creates courtside disputes. An empty seat is cheaper than an argument.

UI must make this legible: "Your party of 3 needs 3 open seats."

## 2. Pending +1s hold no seats

Guests are created in `pending` and consume nothing. Seats are claimed at the **moment of approval**, at the host's existing queue position.

Consequences to implement deliberately:
- Approving a guest for someone near the bottom of "going" may push a later party onto the waitlist. This is correct behavior, not a bug. Notify the demoted party.
- Approval order among admins cannot be gamed, because nothing is reserved by asking.
- Removing an approved guest frees seats immediately and needs no approval.

## 3. +1s are capped per event

`max_guests_per_rsvp` is nullable (null = unlimited), set on the series and overridable per instance, exactly like `capacity`.

Enforcement rules:
- Checked **server-side inside the RSVP transaction**, never only in the UI.
- The count includes **pending + approved** guests (excluding `removed`/`rejected`). Otherwise a user could stack pending requests to sneak past the cap once approvals land.
- **Admin-added guests are exempt** from the cap.

## 4. No cancellation cutoffs

Users may cancel at any time up to and including event start. The boundary recomputes and promotion notifications fire as usual. No-show tracking is explicitly out of scope.

## 5. Admin +1 priority means bypass-approval only

Admin-added guests are created directly in `approved` state — they skip the approval step. They still attach to the host's existing queue position. **No queue jumping, no displacing anyone** beyond the normal boundary recomputation that any approval causes.

---

## Derived rules that follow from the above

- **Uncapped events** (`capacity = null`): everyone is "going," the waitlist never populates, and the UI hides the waitlist section entirely.
- **Waivers never block anything.** The user waiver is required once before a user's first RSVP. Guest waivers are generated and sent, but an unsigned guest waiver does **not** block approval or attendance — admins collect signatures onsite. Show an "outstanding waiver" badge instead.
- **Canceled RSVPs are retained, not deleted.** They leave the queue but remain visible in the event's "canceled" list.
