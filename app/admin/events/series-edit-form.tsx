"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input, Textarea, Select } from "@/components/ui/inputs";
import { ErrorText, HelperText } from "@/components/ui/text";
import { autofillMapsLinksOnBlur } from "@/lib/maps-links";
import { looksLikeAddress, EXACT_LOCATION_HINT } from "@/lib/events/exact-location";

export interface SeriesEditFormInitialValues {
  title: string;
  description: string;
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

export interface SeriesEditFormBody {
  title: FormDataEntryValue | null;
  description: string | null;
  capacity: number | null;
  maxGuestsPerRsvp: number | null;
  waiverRequired: boolean;
  generalLocation: string | null;
  exactLocation: string;
  googleMapsUrl: string | null;
  appleMapsUrl: string | null;
  locationRevealPolicy: FormDataEntryValue | null;
  locationRevealHours: number | null;
}

const sectionHeaderClass = "text-sm font-semibold text-muted";
const sectionClass = "flex flex-col gap-3 border-t border-border pt-4 first:border-t-0 first:pt-0";

// Deliberately no Schedule section — weekdays/times/timezone/recurUntil
// aren't editable at the series level for this phase
// (lib/events/series-schema.ts#updateSeriesSchema's comment explains why:
// reconciling already-materialized dates against a changed weekly pattern
// is its own feature). Everything here propagates to every future
// occurrence that hasn't been hand-edited individually — see
// lib/events/series.ts#updateSeries.
export function SeriesEditForm({
  initialValues,
  onSubmit,
  onSuccess,
}: {
  initialValues: SeriesEditFormInitialValues;
  onSubmit: (body: SeriesEditFormBody) => Promise<{ ok: boolean; error?: string }>;
  onSuccess?: () => void;
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
    const exactLocation = form.get("exactLocation") as string;

    if (!looksLikeAddress(exactLocation)) {
      setError(EXACT_LOCATION_HINT);
      setLoading(false);
      return;
    }

    const body: SeriesEditFormBody = {
      title: form.get("title"),
      description: (form.get("description") as string) || null,
      capacity: capacityRaw ? Number(capacityRaw) : null,
      maxGuestsPerRsvp: maxGuestsRaw ? Number(maxGuestsRaw) : null,
      waiverRequired: form.get("waiverRequired") === "on",
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
      onSuccess?.();
    } finally {
      setLoading(false);
    }
  }

  const iv = initialValues;

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <HelperText>
        Updates every upcoming occurrence of this series — except any you&apos;ve already edited individually, which are left
        alone. The schedule (days, times, end date) can&apos;t be changed here; cancel the series and create a new one for that.
      </HelperText>

      <div className={sectionClass}>
        <h3 className={sectionHeaderClass}>Basics</h3>
        <Input name="title" placeholder="Title" required defaultValue={iv.title} />
        <Textarea name="description" placeholder="Description (optional)" defaultValue={iv.description} />
      </div>

      <div className={sectionClass}>
        <h3 className={sectionHeaderClass}>Capacity &amp; guests</h3>
        <Input name="capacity" type="number" placeholder="Capacity (blank = unlimited)" defaultValue={iv.capacity} />
        <Input
          name="maxGuestsPerRsvp"
          type="number"
          placeholder="Max guests per RSVP (blank = unlimited)"
          defaultValue={iv.maxGuestsPerRsvp}
        />
        <label className="flex items-center gap-2 text-sm">
          <input name="waiverRequired" type="checkbox" defaultChecked={iv.waiverRequired} />
          Require this group&apos;s waiver to RSVP
        </label>
      </div>

      <div className={sectionClass}>
        <h3 className={sectionHeaderClass}>Location</h3>
        <Input name="generalLocation" placeholder="General location" defaultValue={iv.generalLocation} />
        <Input
          name="exactLocation"
          placeholder='Exact location — a real address (e.g. "123 Main St, Springfield")'
          required
          defaultValue={iv.exactLocation}
          onBlur={autofillMapsLinksOnBlur}
        />
        <Input name="googleMapsUrl" type="url" placeholder="Google Maps link (optional)" defaultValue={iv.googleMapsUrl} />
        <Input name="appleMapsUrl" type="url" placeholder="Apple Maps link (optional)" defaultValue={iv.appleMapsUrl} />

        <Select name="locationRevealPolicy" defaultValue={iv.locationRevealPolicy}>
          <option value="always">Always visible</option>
          <option value="hours_before">Hours before start</option>
          <option value="day_of">Day of event</option>
          <option value="hidden">Hidden until day of</option>
        </Select>
        <Input
          name="locationRevealHours"
          type="number"
          placeholder="Reveal hours before (if applicable)"
          defaultValue={iv.locationRevealHours}
        />
      </div>

      {error && <ErrorText>{error}</ErrorText>}

      <Button type="submit" loading={loading}>
        Save changes to series
      </Button>
    </form>
  );
}
