"use client";

import { useState } from "react";

export interface EventFormInitialValues {
  title: string;
  description: string;
  startsAt: string; // datetime-local format (local wall time, no offset)
  endsAt: string;
  signupOpensAt: string;
  timezone: string;
  capacity: string;
  maxGuestsPerRsvp: string;
  generalLocation: string;
  exactLocation: string;
  locationRevealPolicy: string;
  locationRevealHours: string;
}

export interface EventFormBody {
  title: FormDataEntryValue | null;
  description: string | null;
  startsAt: string;
  endsAt: string;
  timezone: FormDataEntryValue | null;
  capacity: number | null;
  maxGuestsPerRsvp: number | null;
  signupOpensAt: string;
  generalLocation: string | null;
  exactLocation: string | null;
  locationRevealPolicy: FormDataEntryValue | null;
  locationRevealHours: number | null;
}

export function EventForm({
  initialValues,
  submitLabel,
  onSubmit,
  onSuccess,
  resetOnSuccess = false,
}: {
  initialValues?: Partial<EventFormInitialValues>;
  submitLabel: string;
  onSubmit: (body: EventFormBody) => Promise<{ ok: boolean; error?: string }>;
  onSuccess?: () => void;
  resetOnSuccess?: boolean;
}) {
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

    const body: EventFormBody = {
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
      const result = await onSubmit(body);
      if (!result.ok) {
        setError(result.error ?? "Something went wrong.");
        return;
      }
      if (resetOnSuccess) e.currentTarget.reset();
      onSuccess?.();
    } finally {
      setLoading(false);
    }
  }

  const iv = initialValues;
  const inputClass = "rounded border border-zinc-300 px-3 py-2 dark:border-zinc-700 dark:bg-black";

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3">
      <input name="title" placeholder="Title" required defaultValue={iv?.title} className={inputClass} />
      <textarea name="description" placeholder="Description (optional)" defaultValue={iv?.description} className={inputClass} />

      <label className="flex flex-col gap-1 text-sm">
        Starts at
        <input name="startsAt" type="datetime-local" required defaultValue={iv?.startsAt} className={inputClass} />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        Ends at
        <input name="endsAt" type="datetime-local" required defaultValue={iv?.endsAt} className={inputClass} />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        Signup opens at
        <input name="signupOpensAt" type="datetime-local" required defaultValue={iv?.signupOpensAt} className={inputClass} />
      </label>

      <input name="timezone" defaultValue={iv?.timezone ?? "America/New_York"} required className={inputClass} />
      <input
        name="capacity"
        type="number"
        placeholder="Capacity (blank = unlimited)"
        defaultValue={iv?.capacity}
        className={inputClass}
      />
      <input
        name="maxGuestsPerRsvp"
        type="number"
        placeholder="Max guests per RSVP (blank = unlimited)"
        defaultValue={iv?.maxGuestsPerRsvp}
        className={inputClass}
      />

      <input name="generalLocation" placeholder="General location" defaultValue={iv?.generalLocation} className={inputClass} />
      <input name="exactLocation" placeholder="Exact location" defaultValue={iv?.exactLocation} className={inputClass} />

      <select name="locationRevealPolicy" defaultValue={iv?.locationRevealPolicy ?? "always"} className={inputClass}>
        <option value="always">Always visible</option>
        <option value="hours_before">Hours before start</option>
        <option value="day_of">Day of event</option>
        <option value="hidden">Hidden until day of</option>
      </select>
      <input
        name="locationRevealHours"
        type="number"
        placeholder="Reveal hours before (if applicable)"
        defaultValue={iv?.locationRevealHours}
        className={inputClass}
      />

      {error && <p className="text-sm text-red-600">{error}</p>}

      <button type="submit" disabled={loading} className="rounded bg-foreground px-4 py-2 text-background disabled:opacity-50">
        {submitLabel}
      </button>
    </form>
  );
}
