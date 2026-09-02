# Policy — settled business rules

These rules are decided. They are not open for reinterpretation during implementation. When a requirement seems ambiguous, the answer is almost always here.

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

## 6. Groups are the visibility and identity boundary — not just a filter

A user with no active membership in a group cannot see that group exists, list its events, or appear in its member/admin views — this is an authorization rule, not a UI filter, and must be enforced in the service layer like every other authz check.

- **`open` groups**: a valid join code activates membership immediately, no admin action required.
- **`approval` groups**: a valid join code creates a `pending` membership; the user sees nothing about that group until a group admin approves it. Rejection is a hard stop (the user may request again, e.g. by submitting the code again — this does not create duplicate rows; treat it as retrying the same pending/rejected membership).
- **Two tiers of admin.** A **group admin** (`group_memberships.role = admin`) is scoped to only their own group(s) — being an admin of one confers no authority in another. A **platform admin** (`users.role = admin`) has full administrative control over *every* group, without needing a membership row in each one — this is the deliberate "break glass" tier for the people operating the deployment, not a per-group concept. Day-to-day group management should be done as a group admin; platform admin is for setup, support, and cross-group intervention.
- **Group creation is platform-admin-only, not self-serve.** Any authenticated member being able to spin up a group would defeat the point of scoping (instant admin of a fresh, empty tenant). For now, only a platform admin can create a group, and assigns its first group admin at creation time. Revisit only as an explicit product decision — never quietly relaxed to unblock a feature.
- **Waiver requirement is per event/series, waiver content is per group, and this is on top of the platform waiver, not instead of it.** A group can require its own (group-scoped) waiver on some events and not others. This is a second, independent acceptance from Phase 0's platform onboarding waiver — both can be required at once. The group-waiver gate is checked alongside signup-open and capacity, inside the same RSVP transaction — never only in the UI.

---

## Derived rules that follow from the above

- **Uncapped events** (`capacity = null`): everyone is "going," the waitlist never populates, and the UI hides the waitlist section entirely.
- **Guest waivers never block anything.** Guest waivers are generated and sent, but an unsigned guest waiver does **not** block approval or attendance — admins collect signatures onsite. Show an "outstanding waiver" badge instead. (This is distinct from both the platform waiver and a group's own waiver, rule 6 — those two *do* gate a member's own RSVP when applicable, same as Phase 0/1's original waiver check always did.)
- **Canceled RSVPs are retained, not deleted.** They leave the queue but remain visible in the event's "canceled" list.
