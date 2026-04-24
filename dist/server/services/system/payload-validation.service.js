import { z } from "zod";
export function validatePayload(schema, payload) {
    return schema.parse(payload);
}
const shutdownAuthSchema = z.object({
    secretHeader: z.string().trim().optional(),
    secretQuery: z.string().trim().optional(),
});
export function validateShutdownAuthPayload(payload) {
    return validatePayload(shutdownAuthSchema, payload);
}
