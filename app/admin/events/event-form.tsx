"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input, Textarea, Select } from "@/components/ui/inputs";
import { ErrorText } from "@/components/ui/text";

export interface EventFormInitialValues {
  title: string;
  description: string;
  startsAt: string; // datetime-local format (local wall time, no offset)
  endsAt: string;
  signupOpensAt: string;
  timezone: string;
  capacity: string;
  maxGuestsPerRsvp: string;
  waiverRequired: boolean;
  generalLocation: string;
  exactLocation: string;
  googleMapsUrl: string;
  appleMapsUrl: string;
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
  waiverRequired: boolean;
  signupOpensAt: string;
  generalLocation: string | null;
  exactLocation: string | null;
  googleMapsUrl: string | null;
  appleMapsUrl: string | null;
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

    // React nulls out `e.currentTarget` once this handler yields (the
    // `await onSubmit(...)` below) — capture the element now, not just the
    // FormData snapshot, so `formEl.reset()` afterward has something to call.
    const formEl = e.currentTarget;
    const form = new FormData(formEl);
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
      waiverRequired: form.get("waiverRequired") === "on",
      signupOpensAt: new Date(form.get("signupOpensAt") as string).toISOString(),
      generalLocation: (form.get("generalLocation") as string) || null,
      exactLocation: (form.get("exactLocation") as string) || null,
      googleMapsUrl: (form.get("googleMapsUrl") as string) || null,
      appleMapsUrl: (form.get("appleMapsUrl") as string) || null,
      locationRevealPolicy: form.get("locationRevealPolicy"),
      locationRevealHours: revealHoursRaw ? Number(revealHoursRaw) : null,
    };

    try {
      const result = await onSubmit(body);
      if (!result.ok) {
        setError(result.error ?? "Something went wrong.");
        return;
      }
      if (resetOnSuccess) formEl.reset();
      onSuccess?.();
    } finally {
      setLoading(false);
    }
  }

  const iv = initialValues;

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3">
      <Input name="title" placeholder="Title" required defaultValue={iv?.title} />
      <Textarea name="description" placeholder="Description (optional)" defaultValue={iv?.description} />

      <label className="flex flex-col gap-1 text-sm">
        Starts at
        <Input name="startsAt" type="datetime-local" required defaultValue={iv?.startsAt} />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        Ends at
        <Input name="endsAt" type="datetime-local" required defaultValue={iv?.endsAt} />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        Signup opens at
        <Input name="signupOpensAt" type="datetime-local" required defaultValue={iv?.signupOpensAt} />
      </label>

      <Input name="timezone" defaultValue={iv?.timezone ?? "America/New_York"} required />
      <Input name="capacity" type="number" placeholder="Capacity (blank = unlimited)" defaultValue={iv?.capacity} />
      <Input
        name="maxGuestsPerRsvp"
        type="number"
        placeholder="Max guests per RSVP (blank = unlimited)"
        defaultValue={iv?.maxGuestsPerRsvp}
      />
      <label className="flex items-center gap-2 text-sm">
        <input name="waiverRequired" type="checkbox" defaultChecked={iv?.waiverRequired} />
        Require this group&apos;s waiver to RSVP
      </label>

      <Input name="generalLocation" placeholder="General location" defaultValue={iv?.generalLocation} />
      <Input name="exactLocation" placeholder="Exact location" defaultValue={iv?.exactLocation} />
      <Input name="googleMapsUrl" type="url" placeholder="Google Maps link (optional)" defaultValue={iv?.googleMapsUrl} />
      <Input name="appleMapsUrl" type="url" placeholder="Apple Maps link (optional)" defaultValue={iv?.appleMapsUrl} />

      <Select name="locationRevealPolicy" defaultValue={iv?.locationRevealPolicy ?? "always"}>
        <option value="always">Always visible</option>
        <option value="hours_before">Hours before start</option>
        <option value="day_of">Day of event</option>
        <option value="hidden">Hidden until day of</option>
      </Select>
      <Input
        name="locationRevealHours"
        type="number"
        placeholder="Reveal hours before (if applicable)"
        defaultValue={iv?.locationRevealHours}
      />

      {error && <ErrorText>{error}</ErrorText>}

      <Button type="submit" loading={loading}>
        {submitLabel}
      </Button>
    </form>
  );
}
