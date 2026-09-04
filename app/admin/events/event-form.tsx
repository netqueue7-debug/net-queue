"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input, Textarea, Select } from "@/components/ui/inputs";
import { ErrorText } from "@/components/ui/text";
import { US_TIMEZONES } from "@/lib/us-timezones";
import { autofillMapsLinksOnBlur } from "@/lib/maps-links";
import { looksLikeAddress, EXACT_LOCATION_HINT } from "@/lib/events/exact-location";

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
  exactLocation: string;
  googleMapsUrl: string | null;
  appleMapsUrl: string | null;
  locationRevealPolicy: FormDataEntryValue | null;
  locationRevealHours: number | null;
}

const sectionHeaderClass = "text-sm font-semibold text-muted";
const sectionClass = "flex flex-col gap-3 border-t border-border pt-4 first:border-t-0 first:pt-0";
const fieldLabelClass = "flex flex-col gap-1 text-sm";

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
  // Only offered on create — editing keeps the plain absolute field below,
  // since a materialized event has no persisted "rule" to re-derive a
  // sensible default from, unlike a series (see docs/phase-2 notes on
  // signupOpensRule being series-only).
  const [signupOpensMode, setSignupOpensMode] = useState<"immediately" | "days_before">("immediately");

  const iv = initialValues;
  const isEditing = iv !== undefined;

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
    const startsAt = new Date(form.get("startsAt") as string);
    const exactLocation = form.get("exactLocation") as string;

    if (!looksLikeAddress(exactLocation)) {
      setError(EXACT_LOCATION_HINT);
      setLoading(false);
      return;
    }

    const signupOpensAt = isEditing
      ? new Date(form.get("signupOpensAt") as string)
      : signupOpensMode === "immediately"
        ? new Date()
        : new Date(startsAt.getTime() - Number(form.get("signupOpensDaysBefore") as string) * 24 * 60 * 60 * 1000);

    const body: EventFormBody = {
      title: form.get("title"),
      description: (form.get("description") as string) || null,
      startsAt: startsAt.toISOString(),
      endsAt: new Date(form.get("endsAt") as string).toISOString(),
      timezone: form.get("timezone"),
      capacity: capacityRaw ? Number(capacityRaw) : null,
      maxGuestsPerRsvp: maxGuestsRaw ? Number(maxGuestsRaw) : null,
      waiverRequired: form.get("waiverRequired") === "on",
      signupOpensAt: signupOpensAt.toISOString(),
      generalLocation: (form.get("generalLocation") as string) || null,
      exactLocation,
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

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <div className={sectionClass}>
        <h3 className={sectionHeaderClass}>Basics</h3>
        <Input name="title" placeholder="Title" required defaultValue={iv?.title} />
        <Textarea name="description" placeholder="Description (optional)" defaultValue={iv?.description} />
      </div>

      <div className={sectionClass}>
        <h3 className={sectionHeaderClass}>Schedule</h3>
        <label className={fieldLabelClass}>
          Starts at
          <Input name="startsAt" type="datetime-local" required defaultValue={iv?.startsAt} />
        </label>
        <label className={fieldLabelClass}>
          Ends at
          <Input name="endsAt" type="datetime-local" required defaultValue={iv?.endsAt} />
        </label>
        <label className={fieldLabelClass}>
          Timezone
          <Select name="timezone" defaultValue={iv?.timezone ?? "America/New_York"} required>
            {US_TIMEZONES.map((tz) => (
              <option key={tz.value} value={tz.value}>
                {tz.label}
              </option>
            ))}
          </Select>
        </label>

        {isEditing ? (
          <label className={fieldLabelClass}>
            Signup opens at
            <Input name="signupOpensAt" type="datetime-local" required defaultValue={iv.signupOpensAt} />
          </label>
        ) : (
          <>
            <label className={fieldLabelClass}>
              Signup opens
              <Select value={signupOpensMode} onChange={(e) => setSignupOpensMode(e.target.value as "immediately" | "days_before")}>
                <option value="immediately">Immediately (as soon as this event is created)</option>
                <option value="days_before">A fixed number of days before it starts</option>
              </Select>
            </label>
            {signupOpensMode === "days_before" && (
              <Input name="signupOpensDaysBefore" type="number" min={1} placeholder="Days before start" required />
            )}
          </>
        )}
      </div>

      <div className={sectionClass}>
        <h3 className={sectionHeaderClass}>Capacity &amp; guests</h3>
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
      </div>

      <div className={sectionClass}>
        <h3 className={sectionHeaderClass}>Location</h3>
        <Input name="generalLocation" placeholder="General location" defaultValue={iv?.generalLocation} />
        <Input
          name="exactLocation"
          placeholder='Exact location — a real address (e.g. "123 Main St, Springfield")'
          required
          defaultValue={iv?.exactLocation}
          onBlur={autofillMapsLinksOnBlur}
        />
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
      </div>

      {error && <ErrorText>{error}</ErrorText>}

      <Button type="submit" loading={loading}>
        {submitLabel}
      </Button>
    </form>
  );
}
