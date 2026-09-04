import { z } from "zod";
import { windowStart, windowEnd } from "./window";
import { looksLikeAddress, EXACT_LOCATION_HINT } from "./exact-location";

const validTimezones = new Set(Intl.supportedValuesOf("timeZone"));

const timezone = z.string().refine((tz) => validTimezones.has(tz), { message: "Not a recognized IANA timezone." });
const locationRevealPolicy = z.enum(["always", "hours_before", "day_of", "hidden"]);
const WINDOW_MESSAGE = "Events can only be scheduled between 1 month ago and 12 months from now.";

// Required, not just optional free text (previously `.nullable().optional()`)
// — an event needs a real address to post. Exported for reuse by
// series-schema.ts, so a series requires the same thing.
export const exactLocationSchema = z.string().trim().max(500).refine(looksLikeAddress, { message: EXACT_LOCATION_HINT });

// Optional map link — an empty string (a blank form field) is treated the
// same as omitting it entirely, not as "please enter a URL." Exported for
// reuse by series-schema.ts, so a series' map links validate identically.
export const optionalMapUrl = z
  .string()
  .trim()
  .max(2000)
  .refine((v) => v === "" || /^https?:\/\//i.test(v), { message: "Must be a valid http(s) URL." })
  .nullable()
  .optional();

export const createEventSchema = z
  .object({
    groupId: z.string().min(1),
    title: z.string().trim().min(1).max(200),
    description: z.string().trim().max(5000).nullable().optional(),
    startsAt: z.coerce.date(),
    endsAt: z.coerce.date(),
    timezone,
    capacity: z.number().int().positive().nullable().optional(),
    maxGuestsPerRsvp: z.number().int().nonnegative().nullable().optional(),
    waiverRequired: z.boolean().optional(),
    signupOpensAt: z.coerce.date(),
    generalLocation: z.string().trim().max(500).nullable().optional(),
    exactLocation: exactLocationSchema,
    googleMapsUrl: optionalMapUrl,
    appleMapsUrl: optionalMapUrl,
    locationRevealPolicy,
    locationRevealHours: z.number().int().positive().nullable().optional(),
  })
  .refine((v) => v.endsAt > v.startsAt, { message: "endsAt must be after startsAt", path: ["endsAt"] })
  .refine((v) => v.startsAt >= windowStart() && v.startsAt < windowEnd(), { message: WINDOW_MESSAGE, path: ["startsAt"] })
  .transform((v) => ({
    ...v,
    description: v.description ?? null,
    capacity: v.capacity ?? null,
    maxGuestsPerRsvp: v.maxGuestsPerRsvp ?? null,
    waiverRequired: v.waiverRequired ?? false,
    generalLocation: v.generalLocation ?? null,
    googleMapsUrl: v.googleMapsUrl ? v.googleMapsUrl : null,
    appleMapsUrl: v.appleMapsUrl ? v.appleMapsUrl : null,
    locationRevealHours: v.locationRevealHours ?? null,
  }));

export const updateEventSchema = z
  .object({
    title: z.string().trim().min(1).max(200),
    description: z.string().trim().max(5000).nullable(),
    startsAt: z.coerce.date(),
    endsAt: z.coerce.date(),
    timezone,
    capacity: z.number().int().positive().nullable(),
    maxGuestsPerRsvp: z.number().int().nonnegative().nullable(),
    waiverRequired: z.boolean(),
    signupOpensAt: z.coerce.date(),
    generalLocation: z.string().trim().max(500).nullable(),
    exactLocation: exactLocationSchema,
    googleMapsUrl: optionalMapUrl,
    appleMapsUrl: optionalMapUrl,
    locationRevealPolicy,
    locationRevealHours: z.number().int().positive().nullable(),
  })
  .partial()
  .refine((v) => v.startsAt === undefined || (v.startsAt >= windowStart() && v.startsAt < windowEnd()), {
    message: WINDOW_MESSAGE,
    path: ["startsAt"],
  })
  .transform((v) => ({
    ...v,
    googleMapsUrl: v.googleMapsUrl !== undefined ? (v.googleMapsUrl ? v.googleMapsUrl : null) : undefined,
    appleMapsUrl: v.appleMapsUrl !== undefined ? (v.appleMapsUrl ? v.appleMapsUrl : null) : undefined,
  }));
