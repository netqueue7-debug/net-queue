"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input, Textarea, Select } from "@/components/ui/inputs";
import { ErrorText } from "@/components/ui/text";
import { US_TIMEZONES } from "@/lib/us-timezones";

const WEEKDAYS = [
  { value: 0, label: "Sun" },
  { value: 1, label: "Mon" },
  { value: 2, label: "Tue" },
  { value: 3, label: "Wed" },
  { value: 4, label: "Thu" },
  { value: 5, label: "Fri" },
  { value: 6, label: "Sat" },
];

const sectionHeaderClass = "text-sm font-semibold text-muted";
const sectionClass = "flex flex-col gap-3 border-t border-border pt-4 first:border-t-0 first:pt-0";
const fieldLabelClass = "flex flex-col gap-1 text-sm";

// Browser-local "today" as a default suggestion, not a hard constraint —
// freely editable, and only meant to preserve the pre-recurStartsAt
// implicit behavior (start today) as the zero-effort common case.
function todayDateString(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function CreateSeriesForm({ groupId, onSuccess }: { groupId: string; onSuccess?: () => void }) {
  const router = useRouter();
  const [weekdays, setWeekdays] = useState<number[]>([]);
  const [signupOpensRule, setSignupOpensRule] = useState<"immediately" | "days_before">("immediately");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  function toggleWeekday(day: number) {
    setWeekdays((prev) => (prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day].sort()));
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);

    if (weekdays.length === 0) {
      setError("Pick at least one day of the week.");
      return;
    }
    setLoading(true);

    const form = new FormData(e.currentTarget);
    const capacityRaw = form.get("capacity") as string;
    const maxGuestsRaw = form.get("maxGuestsPerRsvp") as string;
    const daysBeforeRaw = form.get("signupOpensDaysBefore") as string;
    const revealHoursRaw = form.get("locationRevealHours") as string;

    const body = {
      groupId,
      title: form.get("title"),
      description: (form.get("description") as string) || null,
      weekdays,
      startTime: form.get("startTime"),
      endTime: form.get("endTime"),
      timezone: form.get("timezone"),
      recurStartsAt: form.get("recurStartsAt"),
      recurUntil: form.get("recurUntil"),
      signupOpensRule,
      signupOpensDaysBefore: signupOpensRule === "days_before" && daysBeforeRaw ? Number(daysBeforeRaw) : null,
      capacity: capacityRaw ? Number(capacityRaw) : null,
      maxGuestsPerRsvp: maxGuestsRaw ? Number(maxGuestsRaw) : null,
      waiverRequired: form.get("waiverRequired") === "on",
      generalLocation: (form.get("generalLocation") as string) || null,
      exactLocation: (form.get("exactLocation") as string) || null,
      googleMapsUrl: (form.get("googleMapsUrl") as string) || null,
      appleMapsUrl: (form.get("appleMapsUrl") as string) || null,
      locationRevealPolicy: form.get("locationRevealPolicy"),
      locationRevealHours: revealHoursRaw ? Number(revealHoursRaw) : null,
    };

    try {
      const res = await fetch("/api/event-series", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const responseBody = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(responseBody.error ?? "Failed to create series.");
        return;
      }
      // No separate series page — the calendar itself shows the newly
      // materialized instances immediately.
      router.refresh();
      onSuccess?.();
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <div className={sectionClass}>
        <h3 className={sectionHeaderClass}>Basics</h3>
        <Input name="title" placeholder="Title" required />
        <Textarea name="description" placeholder="Description (optional)" />
      </div>

      <div className={sectionClass}>
        <h3 className={sectionHeaderClass}>Schedule</h3>
        <fieldset className="flex flex-col gap-1">
          <legend className="text-sm text-muted">Days of the week</legend>
          <div className="flex flex-wrap gap-2">
            {WEEKDAYS.map((d) => (
              <label key={d.value} className="flex items-center gap-1 text-sm">
                <input type="checkbox" checked={weekdays.includes(d.value)} onChange={() => toggleWeekday(d.value)} />
                {d.label}
              </label>
            ))}
          </div>
        </fieldset>

        <label className={fieldLabelClass}>
          Start time
          <Input name="startTime" type="time" required />
        </label>
        <label className={fieldLabelClass}>
          End time
          <Input name="endTime" type="time" required />
        </label>
        <label className={fieldLabelClass}>
          Timezone
          <Select name="timezone" defaultValue="America/New_York" required>
            {US_TIMEZONES.map((tz) => (
              <option key={tz.value} value={tz.value}>
                {tz.label}
              </option>
            ))}
          </Select>
        </label>
        <label className={fieldLabelClass}>
          Recur starts at (first possible date)
          <Input name="recurStartsAt" type="date" required defaultValue={todayDateString()} />
        </label>
        <label className={fieldLabelClass}>
          Recurs until (last possible date)
          <Input name="recurUntil" type="date" required />
        </label>

        <label className={fieldLabelClass}>
          Signup opens
          <Select value={signupOpensRule} onChange={(e) => setSignupOpensRule(e.target.value as "immediately" | "days_before")}>
            <option value="immediately">Immediately (as soon as each instance exists)</option>
            <option value="days_before">A fixed number of days before each instance</option>
          </Select>
        </label>
        {signupOpensRule === "days_before" && (
          <Input name="signupOpensDaysBefore" type="number" min={1} placeholder="Days before start" required />
        )}
      </div>

      <div className={sectionClass}>
        <h3 className={sectionHeaderClass}>Capacity &amp; guests</h3>
        <Input name="capacity" type="number" placeholder="Capacity (blank = unlimited)" />
        <Input name="maxGuestsPerRsvp" type="number" placeholder="Max guests per RSVP (blank = unlimited)" />
        <label className="flex items-center gap-2 text-sm">
          <input name="waiverRequired" type="checkbox" />
          Require this group&apos;s waiver to RSVP
        </label>
      </div>

      <div className={sectionClass}>
        <h3 className={sectionHeaderClass}>Location</h3>
        <Input name="generalLocation" placeholder="General location" />
        <Input name="exactLocation" placeholder="Exact location" />
        <Input name="googleMapsUrl" type="url" placeholder="Google Maps link (optional)" />
        <Input name="appleMapsUrl" type="url" placeholder="Apple Maps link (optional)" />
        <Select name="locationRevealPolicy" defaultValue="always">
          <option value="always">Always visible</option>
          <option value="hours_before">Hours before start</option>
          <option value="day_of">Day of event</option>
          <option value="hidden">Hidden until day of</option>
        </Select>
        <Input name="locationRevealHours" type="number" placeholder="Reveal hours before (if applicable)" />
      </div>

      {error && <ErrorText>{error}</ErrorText>}

      <Button type="submit" loading={loading}>
        Create series
      </Button>
    </form>
  );
}
