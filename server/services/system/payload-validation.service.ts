import { z } from "zod";

export function validatePayload<T>(
  schema: z.ZodType<T>,
  payload: unknown
): T {
  return schema.parse(payload);
}

const shutdownAuthSchema = z.object({
  secretHeader: z.string().trim().optional(),
  secretQuery: z.string().trim().optional(),
});

export type ShutdownAuthPayload = z.infer<typeof shutdownAuthSchema>;

export function validateShutdownAuthPayload(
  payload: unknown
): ShutdownAuthPayload {
  return validatePayload(shutdownAuthSchema, payload);
}
