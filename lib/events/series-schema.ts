import { z } from "zod";
import { optionalMapUrl, exactLocationSchema } from "./schema";

const validTimezones = new Set(Intl.supportedValuesOf("timeZone"));
const timezone = z.string().refine((tz) => validTimezones.has(tz), { message: "Not a recognized IANA timezone." });
const locationRevealPolicy = z.enum(["always", "hours_before", "day_of", "hidden"]);
const timeOfDay = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Expected HH:mm (24-hour).");

export const createSeriesSchema = z
  .object({
    groupId: z.string().min(1),
    title: z.string().trim().min(1).max(200),
    description: z.string().trim().max(5000).nullable().optional(),
    // JS `Date#getUTCDay()` numbering: 0 = Sunday .. 6 = Saturday.
    weekdays: z.array(z.number().int().min(0).max(6)).min(1),
    startTime: timeOfDay,
    endTime: timeOfDay,
    timezone,
    // Calendar date only ("YYYY-MM-DD") — the first local date, in
    // `timezone`, that can have an occurrence. Optional at the service
    // layer (lib/events/series.ts#createSeries defaults to "today" when
    // omitted) but required here since the form always sends one.
    recurStartsAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Expected YYYY-MM-DD."),
    // Calendar date only ("YYYY-MM-DD") — the last local date, in
    // `timezone`, that can have an occurrence. Converted to a concrete
    // instant inside lib/events/series.ts#createSeries.
    recurUntil: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Expected YYYY-MM-DD."),
    signupOpensRule: z.enum(["immediately", "days_before"]),
    signupOpensDaysBefore: z.number().int().positive().nullable().optional(),
    capacity: z.number().int().positive().nullable().optional(),
    maxGuestsPerRsvp: z.number().int().nonnegative().nullable().optional(),
    waiverRequired: z.boolean().optional(),
    generalLocation: z.string().trim().max(500).nullable().optional(),
    exactLocation: exactLocationSchema,
    googleMapsUrl: optionalMapUrl,
    appleMapsUrl: optionalMapUrl,
    locationRevealPolicy,
    locationRevealHours: z.number().int().positive().nullable().optional(),
  })
  .refine((v) => v.endTime > v.startTime, {
    message: "endTime must be after startTime (same-day events only — no overnight series instances).",
    path: ["endTime"],
  })
  .refine((v) => v.recurStartsAt <= v.recurUntil, {
    message: "recurStartsAt must be on or before recurUntil.",
    path: ["recurStartsAt"],
  })
  .refine((v) => v.signupOpensRule !== "days_before" || v.signupOpensDaysBefore != null, {
    message: "signupOpensDaysBefore is required when signupOpensRule is days_before.",
    path: ["signupOpensDaysBefore"],
  })
  .transform((v) => ({
    ...v,
    description: v.description ?? null,
    signupOpensDaysBefore: v.signupOpensDaysBefore ?? null,
    capacity: v.capacity ?? null,
    maxGuestsPerRsvp: v.maxGuestsPerRsvp ?? null,
    waiverRequired: v.waiverRequired ?? false,
    generalLocation: v.generalLocation ?? null,
    googleMapsUrl: v.googleMapsUrl ? v.googleMapsUrl : null,
    appleMapsUrl: v.appleMapsUrl ? v.appleMapsUrl : null,
    locationRevealHours: v.locationRevealHours ?? null,
  }));

// Deliberately excludes weekdays/startTime/endTime/timezone/recurStartsAt/recurUntil —
// the series' schedule shape is fixed at creation for this phase (changing
// it would mean reconciling already-materialized future instances against
// a new pattern, which is its own feature; "extend the horizon" is
// explicitly Phase 3 scope per docs/phase-3-polish.md's "series horizon
// top-up"). What *is* editable propagates onto future, non-overridden
// instances — see lib/events/series.ts#updateSeries.
export const updateSeriesSchema = z
  .object({
    title: z.string().trim().min(1).max(200),
    description: z.string().trim().max(5000).nullable(),
    capacity: z.number().int().positive().nullable(),
    maxGuestsPerRsvp: z.number().int().nonnegative().nullable(),
    waiverRequired: z.boolean(),
    generalLocation: z.string().trim().max(500).nullable(),
    exactLocation: exactLocationSchema,
    googleMapsUrl: optionalMapUrl,
    appleMapsUrl: optionalMapUrl,
    locationRevealPolicy,
    locationRevealHours: z.number().int().positive().nullable(),
  })
  .partial()
  .transform((v) => ({
    ...v,
    googleMapsUrl: v.googleMapsUrl !== undefined ? (v.googleMapsUrl ? v.googleMapsUrl : null) : undefined,
    appleMapsUrl: v.appleMapsUrl !== undefined ? (v.appleMapsUrl ? v.appleMapsUrl : null) : undefined,
  }));
