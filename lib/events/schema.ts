import { z } from "zod";

const validTimezones = new Set(Intl.supportedValuesOf("timeZone"));

const timezone = z.string().refine((tz) => validTimezones.has(tz), { message: "Not a recognized IANA timezone." });
const locationRevealPolicy = z.enum(["always", "hours_before", "day_of", "hidden"]);

export const createEventSchema = z
  .object({
    title: z.string().trim().min(1).max(200),
    description: z.string().trim().max(5000).nullable().optional(),
    startsAt: z.coerce.date(),
    endsAt: z.coerce.date(),
    timezone,
    capacity: z.number().int().positive().nullable().optional(),
    maxGuestsPerRsvp: z.number().int().nonnegative().nullable().optional(),
    signupOpensAt: z.coerce.date(),
    generalLocation: z.string().trim().max(500).nullable().optional(),
    exactLocation: z.string().trim().max(500).nullable().optional(),
    locationRevealPolicy,
    locationRevealHours: z.number().int().positive().nullable().optional(),
  })
  .refine((v) => v.endsAt > v.startsAt, { message: "endsAt must be after startsAt", path: ["endsAt"] })
  .transform((v) => ({
    ...v,
    description: v.description ?? null,
    capacity: v.capacity ?? null,
    maxGuestsPerRsvp: v.maxGuestsPerRsvp ?? null,
    generalLocation: v.generalLocation ?? null,
    exactLocation: v.exactLocation ?? null,
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
    signupOpensAt: z.coerce.date(),
    generalLocation: z.string().trim().max(500).nullable(),
    exactLocation: z.string().trim().max(500).nullable(),
    locationRevealPolicy,
    locationRevealHours: z.number().int().positive().nullable(),
  })
  .partial();
