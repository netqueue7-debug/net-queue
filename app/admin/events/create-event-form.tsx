"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function CreateEventForm() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const form = new FormData(e.currentTarget);
    const capacityRaw = form.get("capacity") as string;
    const maxGuestsRaw = form.get("maxGuestsPerRsvp") as string;
    const revealHoursRaw = form.get("locationRevealHours") as string;

    const body = {
      title: form.get("title"),
      description: (form.get("description") as string) || null,
      startsAt: new Date(form.get("startsAt") as string).toISOString(),
      endsAt: new Date(form.get("endsAt") as string).toISOString(),
      timezone: form.get("timezone"),
      capacity: capacityRaw ? Number(capacityRaw) : null,
      maxGuestsPerRsvp: maxGuestsRaw ? Number(maxGuestsRaw) : null,
      signupOpensAt: new Date(form.get("signupOpensAt") as string).toISOString(),
      generalLocation: (form.get("generalLocation") as string) || null,
      exactLocation: (form.get("exactLocation") as string) || null,
      locationRevealPolicy: form.get("locationRevealPolicy"),
      locationRevealHours: revealHoursRaw ? Number(revealHoursRaw) : null,
    };

    try {
      const res = await fetch("/api/events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const b = await res.json().catch(() => ({}));
        setError(b.error ?? "Failed to create event.");
        return;
      }
      router.refresh();
      (document.getElementById("create-event-form") as HTMLFormElement)?.reset();
    } finally {
      setLoading(false);
    }
  }

  return (
    <form id="create-event-form" onSubmit={handleSubmit} className="flex flex-col gap-3">
      <input name="title" placeholder="Title" required className="rounded border border-zinc-300 px-3 py-2 dark:border-zinc-700 dark:bg-black" />
      <textarea name="description" placeholder="Description (optional)" className="rounded border border-zinc-300 px-3 py-2 dark:border-zinc-700 dark:bg-black" />

      <label className="flex flex-col gap-1 text-sm">
        Starts at
        <input name="startsAt" type="datetime-local" required className="rounded border border-zinc-300 px-3 py-2 dark:border-zinc-700 dark:bg-black" />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        Ends at
        <input name="endsAt" type="datetime-local" required className="rounded border border-zinc-300 px-3 py-2 dark:border-zinc-700 dark:bg-black" />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        Signup opens at
        <input name="signupOpensAt" type="datetime-local" required className="rounded border border-zinc-300 px-3 py-2 dark:border-zinc-700 dark:bg-black" />
      </label>

      <input name="timezone" defaultValue="America/New_York" required className="rounded border border-zinc-300 px-3 py-2 dark:border-zinc-700 dark:bg-black" />
      <input name="capacity" type="number" placeholder="Capacity (blank = unlimited)" className="rounded border border-zinc-300 px-3 py-2 dark:border-zinc-700 dark:bg-black" />
      <input name="maxGuestsPerRsvp" type="number" placeholder="Max guests per RSVP (blank = unlimited)" className="rounded border border-zinc-300 px-3 py-2 dark:border-zinc-700 dark:bg-black" />

      <input name="generalLocation" placeholder="General location" className="rounded border border-zinc-300 px-3 py-2 dark:border-zinc-700 dark:bg-black" />
      <input name="exactLocation" placeholder="Exact location" className="rounded border border-zinc-300 px-3 py-2 dark:border-zinc-700 dark:bg-black" />

      <select name="locationRevealPolicy" defaultValue="always" className="rounded border border-zinc-300 px-3 py-2 dark:border-zinc-700 dark:bg-black">
        <option value="always">Always visible</option>
        <option value="hours_before">Hours before start</option>
        <option value="day_of">Day of event</option>
        <option value="hidden">Hidden until day of</option>
      </select>
      <input name="locationRevealHours" type="number" placeholder="Reveal hours before (if applicable)" className="rounded border border-zinc-300 px-3 py-2 dark:border-zinc-700 dark:bg-black" />

      {error && <p className="text-sm text-red-600">{error}</p>}

      <button type="submit" disabled={loading} className="rounded bg-foreground px-4 py-2 text-background disabled:opacity-50">
        Create event
      </button>
    </form>
  );
}
