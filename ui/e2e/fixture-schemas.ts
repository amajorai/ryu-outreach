import { z } from "zod";
export const outreachFixtureSendInputSchema = z.object({
	inboxId: z.string(),
	subject: z.string(),
	text: z.string().optional(),
	to: z.array(z.string()),
	idempotencyKey: z.string().optional(),
});
export const outreachFixtureTransportSchema = z.array(
	outreachFixtureSendInputSchema
);
export const outreachFixtureReplaySchema = z.object({
	fingerprint: z.string(),
	response: z.object({ id: z.string() }).optional(),
});
export const outreachFixtureStorageInputSchema = z.object({
	namespace: z.string().optional(),
	key: z.string(),
	value: z.string(),
});
