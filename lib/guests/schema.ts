import { z } from "zod";

const guestName = z
  .string()
  .trim()
  .max(100)
  .nullable()
  .optional()
  .transform((v) => (v ? v : null));

export const addGuestsSchema = z.object({
  names: z.array(guestName).min(1).max(10),
});

export const adminAddGuestsSchema = z.object({
  userId: z.string().min(1),
  names: z.array(guestName).min(1).max(10),
});

export const signGuestWaiverSchema = z.object({
  name: z.string().trim().min(1).max(100),
});
