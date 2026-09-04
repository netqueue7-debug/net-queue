import { z } from "zod";

export const submitFeedbackSchema = z.object({
  type: z.enum(["bug", "feedback"]),
  body: z.string().trim().min(1).max(5000),
});
