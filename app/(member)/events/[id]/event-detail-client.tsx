"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { EventDetail } from "@/lib/rsvp/event-detail";
import { EventForm, type EventFormBody } from "@/app/admin/events/event-form";

function toDatetimeLocal(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function EventDetailClient({
  detail,
  viewerRole,
  eventId,
}: {
  detail: EventDetail;
  viewerRole: "member" | "admin";
  eventId: string;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [editing, setEditing] = useState(false);

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

  async function handleCancelEvent() {
    if (!window.confirm("Cancel this event? This does not delete it, but members will see it as canceled.")) return;
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

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 p-8">
      <div>
        <h1 className="text-2xl font-semibold">{event.title}</h1>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">{new Date(event.startsAt).toLocaleString()}</p>
        {event.status === "canceled" && <p className="font-medium text-red-600">This event has been canceled.</p>}
        {!signupOpen && (
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            Signup opens {new Date(event.signupOpensAt).toLocaleString()}
          </p>
        )}
      </div>

      <div>
        <p className="text-sm">General location: {event.generalLocation ?? "TBD"}</p>
        {event.exactLocation ? (
          <p className="text-sm">Exact location: {event.exactLocation}</p>
        ) : event.locationRevealsAt ? (
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            Exact location reveals {new Date(event.locationRevealsAt).toLocaleString()}
          </p>
        ) : null}
      </div>

      {viewerRole === "admin" && (
        <div className="flex flex-col gap-3 rounded border border-zinc-300 p-4 dark:border-zinc-700">
          <div className="flex items-center justify-between">
            <h2 className="font-medium">Admin controls</h2>
            <div className="flex gap-3">
              <button onClick={() => setEditing((v) => !v)} className="text-sm underline">
                {editing ? "Cancel editing" : "Edit event"}
              </button>
              {event.status !== "canceled" && (
                <button onClick={handleCancelEvent} disabled={loading} className="text-sm text-red-600 underline disabled:opacity-50">
                  Cancel event
                </button>
              )}
            </div>
          </div>

          {editing && (
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
                generalLocation: event.generalLocation ?? "",
                exactLocation: event.exactLocation ?? "",
                locationRevealPolicy: event.locationRevealPolicy,
                locationRevealHours: event.locationRevealHours?.toString() ?? "",
              }}
            />
          )}
        </div>
      )}

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div>
        {hasActiveRsvp ? (
          <button
            onClick={handleCancel}
            disabled={loading}
            className="rounded border border-zinc-300 px-4 py-2 disabled:opacity-50 dark:border-zinc-700"
          >
            Cancel RSVP
          </button>
        ) : (
          <button
            onClick={handleRsvp}
            disabled={loading || event.status === "canceled" || !signupOpen}
            className="rounded bg-foreground px-4 py-2 text-background disabled:opacity-50"
          >
            RSVP
          </button>
        )}
        {yourRsvp.status === "waitlist" && (
          <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">You&apos;re #{yourRsvp.queuePosition} on the waitlist.</p>
        )}
      </div>

      <section>
        <h2 className="font-medium">Going ({going.length})</h2>
        <ul className="text-sm">
          {going.map((r) => (
            <li key={r.rsvpId} className="flex items-center justify-between py-1">
              <span>
                {r.displayName ?? "Member"}
                {viewerRole === "admin" && r.phone ? ` (${r.phone})` : ""}
              </span>
              {viewerRole === "admin" && (
                <button onClick={() => handleAdminRemove(r.userId)} className="text-xs text-red-600 underline">
                  Remove
                </button>
              )}
            </li>
          ))}
        </ul>
      </section>

      <section>
        <h2 className="font-medium">Waitlist ({waitlist.length})</h2>
        <ul className="text-sm">
          {waitlist.map((r) => (
            <li key={r.rsvpId} className="flex items-center justify-between py-1">
              <span>
                #{r.queuePosition} {r.displayName ?? "Member"}
                {viewerRole === "admin" && r.phone ? ` (${r.phone})` : ""}
              </span>
              {viewerRole === "admin" && (
                <button onClick={() => handleAdminRemove(r.userId)} className="text-xs text-red-600 underline">
                  Remove
                </button>
              )}
            </li>
          ))}
        </ul>
      </section>

      {canceled.length > 0 && (
        <section>
          <h2 className="font-medium">Canceled ({canceled.length})</h2>
          <ul className="text-sm text-zinc-500">
            {canceled.map((r) => (
              <li key={r.rsvpId}>{r.displayName ?? "Member"}</li>
            ))}
          </ul>
        </section>
      )}
    </main>
  );
}
