"use client";

import { useRouter } from "next/navigation";
import Link from "next/link";
import { useState } from "react";
import type { EventDetail, GuestSummary, RsvpListItem } from "@/lib/rsvp/event-detail";
import { formatDateTime, formatTime } from "@/lib/format-datetime";
import { zonedDateString } from "@/lib/timezone";
import { EventForm, type EventFormBody } from "@/app/admin/events/event-form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/inputs";
import { ErrorText, HelperText } from "@/components/ui/text";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Linkify } from "@/components/ui/linkify";
import { LogIcon, PencilIcon, TrashIcon } from "@/components/ui/icons";
import { EventComments } from "./event-comments";

function toDatetimeLocal(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// End time only repeats the full date when it actually falls on a
// different calendar day in the event's own timezone (rare, but the
// schema doesn't forbid it for one-off events) — otherwise just the time,
// since the date's already shown by the start.
function formatEventRange(startsAt: string, endsAt: string, timezone: string): string {
  const sameDay = zonedDateString(new Date(startsAt), timezone) === zonedDateString(new Date(endsAt), timezone);
  return `${formatDateTime(startsAt, timezone)} – ${sameDay ? formatTime(endsAt, timezone) : formatDateTime(endsAt, timezone)}`;
}

function MapLinks({ googleMapsUrl, appleMapsUrl }: { googleMapsUrl: string | null; appleMapsUrl: string | null }) {
  if (!googleMapsUrl && !appleMapsUrl) return null;
  return (
    <p className="text-sm">
      {googleMapsUrl && (
        <a href={googleMapsUrl} target="_blank" rel="noreferrer" className="text-accent hover:underline">
          Google Maps
        </a>
      )}
      {googleMapsUrl && appleMapsUrl && <span className="mx-2 text-muted">·</span>}
      {appleMapsUrl && (
        <a href={appleMapsUrl} target="_blank" rel="noreferrer" className="text-accent hover:underline">
          Apple Maps
        </a>
      )}
    </p>
  );
}

export function EventDetailClient({
  detail,
  viewerRole,
  viewerUserId,
  eventId,
}: {
  detail: EventDetail;
  viewerRole: "member" | "admin";
  viewerUserId: string;
  eventId: string;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [editing, setEditing] = useState(false);
  const [guestNames, setGuestNames] = useState("");
  const [confirmingCancel, setConfirmingCancel] = useState(false);

  async function withLoading(fn: () => Promise<Response>) {
    setError(null);
    setLoading(true);
    try {
      const res = await fn();
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body.error ?? "Something went wrong.");
        return;
      }
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  const handleRsvp = () => withLoading(() => fetch(`/api/events/${eventId}/rsvp`, { method: "POST" }));
  const handleCancel = () => withLoading(() => fetch(`/api/events/${eventId}/rsvp`, { method: "DELETE" }));
  const handleAdminRemove = (userId: string) =>
    withLoading(() =>
      fetch(`/api/admin/events/${eventId}/rsvp`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId }),
      }),
    );

  const handleAddGuests = () =>
    withLoading(() => {
      const names = guestNames
        .split(",")
        .map((n) => n.trim())
        .filter((n) => n.length > 0);
      return fetch(`/api/events/${eventId}/rsvp/guests`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ names: names.length > 0 ? names : [null] }),
      });
    }).then(() => setGuestNames(""));

  const handleRemoveGuest = (guestId: string) => withLoading(() => fetch(`/api/guests/${guestId}`, { method: "DELETE" }));
  const handleApproveGuest = (guestId: string) => withLoading(() => fetch(`/api/guests/${guestId}/approve`, { method: "POST" }));
  const handleRejectGuest = (guestId: string) => withLoading(() => fetch(`/api/guests/${guestId}/reject`, { method: "POST" }));

  async function handleCancelEvent() {
    setConfirmingCancel(false);
    await withLoading(() => fetch(`/api/events/${eventId}`, { method: "DELETE" }));
  }

  async function handleEditSubmit(body: EventFormBody) {
    const res = await fetch(`/api/events/${eventId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const b = await res.json().catch(() => ({}));
      return { ok: false, error: b.error ?? "Failed to save changes." };
    }
    router.refresh();
    return { ok: true };
  }

  const { event, going, waitlist, canceled, yourRsvp } = detail;
  const signupOpen = new Date() >= new Date(event.signupOpensAt);
  const hasActiveRsvp = yourRsvp.status === "going" || yourRsvp.status === "waitlist";
  const shownLocation = event.exactLocation ?? event.generalLocation;

  function approvedGuestCount(r: RsvpListItem): number {
    return r.guests.filter((g) => g.approvalStatus === "approved").length;
  }

  function partyLabel(r: RsvpListItem): string {
    const approvedCount = approvedGuestCount(r);
    const name = r.displayName ?? "Member";
    return approvedCount > 0 ? `${name} +${approvedCount}` : name;
  }

  // Total headcount (RSVP holder + their approved guests), not party count —
  // an approved guest should visibly move this number even when the party
  // was already counted as one entry in `going`/`waitlist`.
  function headcount(list: RsvpListItem[]): number {
    return list.reduce((sum, r) => sum + 1 + approvedGuestCount(r), 0);
  }

  function GuestList({ r }: { r: RsvpListItem }) {
    const isMine = r.userId === viewerUserId;
    if (r.guests.length === 0) return null;
    return (
      <ul className="ml-4 mt-1 flex flex-col gap-0.5 text-xs text-muted">
        {r.guests.map((g: GuestSummary) => (
          <li key={g.id} className="flex flex-wrap items-center gap-2">
            <span>
              {g.name ?? "Unnamed guest"}
              {g.approvalStatus === "pending" ? " (pending approval)" : ""}
            </span>
            {viewerRole === "admin" && g.approvalStatus === "pending" && (
              <>
                <Button variant="affirmative-link" className="text-xs" onClick={() => handleApproveGuest(g.id)}>
                  Approve
                </Button>
                <Button variant="destructive-link" className="text-xs" onClick={() => handleRejectGuest(g.id)}>
                  Reject
                </Button>
              </>
            )}
            {(isMine || viewerRole === "admin") && (
              <Button variant="destructive-link" className="text-xs" onClick={() => handleRemoveGuest(g.id)}>
                Remove
              </Button>
            )}
            {g.waiverToken && (
              <a href={`/waiver/${g.waiverToken}`} target="_blank" rel="noreferrer" className="text-xs underline">
                Waiver link
              </a>
            )}
          </li>
        ))}
      </ul>
    );
  }

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 p-4 sm:p-8">
      <div>
        <div className="flex flex-wrap items-start justify-between gap-2">
          <h1 className="text-2xl font-semibold">{event.title}</h1>
          {event.status !== "canceled" && (
            <a href={`/api/events/${eventId}/ics`} className="text-sm font-medium text-accent hover:underline">
              Add to Calendar
            </a>
          )}
        </div>
        <p className="text-sm text-muted">{formatEventRange(event.startsAt, event.endsAt, event.timezone)}</p>
        {event.status === "canceled" && <p className="font-medium text-danger">This event has been canceled.</p>}
        {!signupOpen && <p className="text-sm text-muted">Signup opens {formatDateTime(event.signupOpensAt, event.timezone)}</p>}
      </div>

      {error && <ErrorText>{error}</ErrorText>}

      <div>
        <p className="text-sm font-semibold">{shownLocation ?? "Location TBD"}</p>
        {!event.exactLocation && event.locationRevealsAt && (
          <p className="text-sm text-muted">Exact location reveals {formatDateTime(event.locationRevealsAt, event.timezone)}</p>
        )}
        <MapLinks googleMapsUrl={event.googleMapsUrl} appleMapsUrl={event.appleMapsUrl} />
      </div>

      {event.description && (
        <p className="whitespace-pre-wrap text-sm">
          <Linkify text={event.description} />
        </p>
      )}

      {!hasActiveRsvp && (
        <div>
          <Button onClick={handleRsvp} disabled={loading || event.status === "canceled" || !signupOpen} loading={loading}>
            RSVP
          </Button>
          {!signupOpen && event.status !== "canceled" && (
            <HelperText>Signup isn&apos;t open yet — opens {formatDateTime(event.signupOpensAt, event.timezone)}.</HelperText>
          )}
        </div>
      )}

      {hasActiveRsvp && (
        <div>
          {yourRsvp.status === "waitlist" && (
            <HelperText>
              You&apos;re #{yourRsvp.queuePosition} on the waitlist. Your party needs enough open seats for everyone to be seated
              together.
            </HelperText>
          )}
          {event.maxGuestsPerRsvp !== null && (
            <HelperText>
              Up to {event.maxGuestsPerRsvp} guest{event.maxGuestsPerRsvp === 1 ? "" : "s"} per RSVP.
            </HelperText>
          )}
          <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center">
            <Input
              value={guestNames}
              onChange={(e) => setGuestNames(e.target.value)}
              placeholder="Guest names, comma separated (optional)"
              className="flex-1 text-sm"
            />
            <Button variant="secondary" onClick={handleAddGuests} disabled={loading} className="text-sm">
              Add guest
            </Button>
          </div>
        </div>
      )}

      <section>
        <h2 className="font-medium">Going ({headcount(going)})</h2>
        <ul className="flex flex-col gap-1 text-sm">
          {going.map((r) => (
            <li key={r.rsvpId} className="py-1">
              <div className="flex items-center justify-between gap-2">
                <span>{partyLabel(r)}</span>
                {viewerRole === "admin" && (
                  <Button variant="destructive-link" className="text-xs" onClick={() => handleAdminRemove(r.userId)}>
                    Remove
                  </Button>
                )}
              </div>
              <GuestList r={r} />
            </li>
          ))}
        </ul>
      </section>

      <section>
        <h2 className="font-medium">Waitlist ({headcount(waitlist)})</h2>
        <ul className="flex flex-col gap-1 text-sm">
          {waitlist.map((r) => (
            <li key={r.rsvpId} className="py-1">
              <div className="flex items-center justify-between gap-2">
                <span>
                  #{r.queuePosition} {partyLabel(r)}
                </span>
                {viewerRole === "admin" && (
                  <Button variant="destructive-link" className="text-xs" onClick={() => handleAdminRemove(r.userId)}>
                    Remove
                  </Button>
                )}
              </div>
              <GuestList r={r} />
            </li>
          ))}
        </ul>
      </section>

      {canceled.length > 0 && (
        <section>
          <h2 className="font-medium">Canceled ({canceled.length})</h2>
          <ul className="text-sm text-muted">
            {canceled.map((r) => (
              <li key={r.rsvpId}>{r.displayName ?? "Member"}</li>
            ))}
          </ul>
        </section>
      )}

      <div className="border-t border-border pt-5">
        <EventComments eventId={eventId} comments={detail.comments} viewerUserId={viewerUserId} viewerRole={viewerRole} />
      </div>

      {hasActiveRsvp && (
        <div className="border-t border-border pt-5">
          <Button variant="secondary" onClick={handleCancel} disabled={loading}>
            Cancel RSVP
          </Button>
        </div>
      )}

      {viewerRole === "admin" && (
        <div className="flex flex-wrap items-center gap-2 border-t border-border pt-5">
          <Link
            href={`/events/${eventId}/log`}
            className="flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-sm hover:border-accent/40 hover:bg-accent/5"
          >
            <LogIcon width={16} height={16} />
            View log
          </Link>
          <Button variant="secondary" className="gap-1.5 px-2.5 py-1.5 text-sm" onClick={() => setEditing((v) => !v)}>
            <PencilIcon width={16} height={16} />
            {editing ? "Cancel editing" : "Edit event"}
          </Button>
          {event.status !== "canceled" && (
            <Button
              variant="destructive"
              className="gap-1.5 px-2.5 py-1.5 text-sm"
              onClick={() => setConfirmingCancel(true)}
              disabled={loading}
            >
              <TrashIcon width={16} height={16} />
              Cancel event
            </Button>
          )}
        </div>
      )}

      {viewerRole === "admin" && editing && (
        <EventForm
          submitLabel="Save changes"
          onSubmit={handleEditSubmit}
          onSuccess={() => setEditing(false)}
          initialValues={{
            title: event.title,
            description: event.description ?? "",
            startsAt: toDatetimeLocal(event.startsAt),
            endsAt: toDatetimeLocal(event.endsAt),
            signupOpensAt: toDatetimeLocal(event.signupOpensAt),
            timezone: event.timezone,
            capacity: event.capacity?.toString() ?? "",
            maxGuestsPerRsvp: event.maxGuestsPerRsvp?.toString() ?? "",
            waiverRequired: event.waiverRequired,
            generalLocation: event.generalLocation ?? "",
            exactLocation: event.exactLocation ?? "",
            googleMapsUrl: event.googleMapsUrl ?? "",
            appleMapsUrl: event.appleMapsUrl ?? "",
            locationRevealPolicy: event.locationRevealPolicy,
            locationRevealHours: event.locationRevealHours?.toString() ?? "",
          }}
        />
      )}

      <ConfirmDialog
        open={confirmingCancel}
        title="Cancel this event?"
        description="This does not delete it, but members will see it as canceled."
        confirmLabel="Cancel event"
        cancelLabel="Never mind"
        loading={loading}
        onConfirm={handleCancelEvent}
        onCancel={() => setConfirmingCancel(false)}
      />
    </main>
  );
}
