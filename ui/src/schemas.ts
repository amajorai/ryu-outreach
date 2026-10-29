import {
	mailInboxRecordSchema,
	mailMessageRecordSchema,
} from "@ryuhq/core-client/mail";
import { z } from "zod";
import type {
	Campaign,
	OutreachState,
	Recipient,
	SendIntent,
} from "./types.ts";

export const recipientStatusSchema = z.enum([
	"ready",
	"sent",
	"replied",
	"paused",
]);
export const campaignStatusSchema = z.enum(["draft", "ready", "sent"]);
export const sendIntentStatusSchema = z.enum([
	"pending",
	"accepted",
	"uncertain",
]);
export const outreachEmailPattern = /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/u;
const persistedSendTextSchema = z.string().min(1).max(100_000);
const sendIntentPayloadSchema = z.object({
	inboxId: persistedSendTextSchema,
	subject: persistedSendTextSchema,
	text: persistedSendTextSchema,
	to: z.tuple([z.string().regex(outreachEmailPattern)]),
});
// Existing deployment limits and printable idempotency keys. Fingerprint equality
// remains a separate reconciliation check so its original error stays distinct.
export const storedSendIntentFieldsSchema = z.object({
	campaignId: persistedSendTextSchema,
	recipientId: persistedSendTextSchema,
	idempotencyKey: persistedSendTextSchema
		.max(256)
		.refine((value) => value.trim().length > 0 && !/[^\x20-\x7e]/u.test(value)),
	createdAt: persistedSendTextSchema,
	status: sendIntentStatusSchema,
	payload: sendIntentPayloadSchema,
	fingerprint: z.string().catch(""),
}) satisfies z.ZodType<SendIntent>;
export const sendIntentSchema = storedSendIntentFieldsSchema.extend({
	fingerprint: z.string(),
});
export const recipientSchema = z.object({
	company: z.string(),
	email: z.string(),
	id: z.string(),
	name: z.string(),
	role: z.string(),
	sendIntent: sendIntentSchema.optional(),
	status: recipientStatusSchema,
}) satisfies z.ZodType<Recipient>;
export const campaignSchema = z.object({
	audience: z.string(),
	body: z.string(),
	createdAt: z.string(),
	cta: z.string(),
	id: z.string(),
	name: z.string(),
	objective: z.string(),
	offer: z.string(),
	recipients: z.array(recipientSchema),
	status: campaignStatusSchema,
	subject: z.string(),
	tone: z.string(),
	updatedAt: z.string(),
}) satisfies z.ZodType<Campaign>;
export const outreachStateSchema = z.object({
	campaigns: z.array(campaignSchema),
	schemaVersion: z.literal(1),
	settings: z.object({ modelId: z.string() }),
}) satisfies z.ZodType<OutreachState>;

// Old persisted records deliberately normalize missing/malformed text fields.
// Parse each expected field before normalization while keeping dynamic indexed
// defaults, unresolved-send guards and fingerprint reconciliation in the model.
const optionalStoredTextSchema = z.string().or(z.undefined()).catch(undefined);
const storedSendValidationSchema = z.unknown().transform((value) => ({
	provided: value !== undefined,
	validation: storedSendIntentFieldsSchema.safeParse(value),
}));
export const storedRecipientFieldsSchema = z.object({
	company: optionalStoredTextSchema,
	email: optionalStoredTextSchema,
	id: optionalStoredTextSchema,
	name: optionalStoredTextSchema,
	role: optionalStoredTextSchema,
	status: recipientStatusSchema.catch("ready"),
	sendIntent: storedSendValidationSchema.optional(),
});
export const storedRecipientValidationSchema = z
	.unknown()
	.transform((value) => storedRecipientFieldsSchema.safeParse(value));
export const storedCampaignFieldsSchema = z.object({
	audience: optionalStoredTextSchema,
	body: optionalStoredTextSchema,
	createdAt: optionalStoredTextSchema,
	cta: optionalStoredTextSchema,
	id: optionalStoredTextSchema,
	name: optionalStoredTextSchema,
	objective: optionalStoredTextSchema,
	offer: optionalStoredTextSchema,
	recipients: z.array(storedRecipientValidationSchema).catch([]),
	status: campaignStatusSchema.catch("draft"),
	subject: optionalStoredTextSchema,
	tone: optionalStoredTextSchema,
	updatedAt: optionalStoredTextSchema,
});
export const storedCampaignValidationSchema = z
	.unknown()
	.transform((value) => storedCampaignFieldsSchema.safeParse(value));
export const storedOutreachFieldsSchema = z.object({
	campaigns: z.array(storedCampaignValidationSchema).catch([]),
	settings: z
		.object({ modelId: optionalStoredTextSchema.optional() })
		.catch({})
		.optional(),
});

export const storedOutreachInputSchema = z
	.unknown()
	.pipe(storedOutreachFieldsSchema);

// Earlier companions exposed just the fields Outreach consumes. The complete
// Core records remain a separate native branch rather than weakening their codec.
const legacyMailInboxSchema = z.object({
	id: z.string(),
	address: z.string().optional(),
	name: z.string().optional(),
});
export const outreachMailInboxSchema = z.union([
	mailInboxRecordSchema,
	legacyMailInboxSchema,
]);
export const outreachMailInboxReplySchema = z.union([
	z.array(outreachMailInboxSchema),
	z.object({ inboxes: z.array(outreachMailInboxSchema) }),
]);
export type OutreachMailInboxReply = z.output<
	typeof outreachMailInboxReplySchema
>;
export const outreachMailSendReplySchema = z.union([
	mailMessageRecordSchema,
	z.object({ id: z.string() }),
]);
export type OutreachMailSendReply = z.output<
	typeof outreachMailSendReplySchema
>;
const storedInboxFieldsSchema = z.object({
	id: optionalStoredTextSchema,
	address: optionalStoredTextSchema,
	name: optionalStoredTextSchema,
});
const storedInboxValidationSchema = z
	.unknown()
	.transform((value) => storedInboxFieldsSchema.safeParse(value));
const storedInboxRowsSchema = z.array(storedInboxValidationSchema);
export const storedInboxReplySchema = z
	.union([
		storedInboxRowsSchema,
		z
			.object({ inboxes: storedInboxRowsSchema.catch([]) })
			.transform((value) => value.inboxes),
	])
	.catch([]);
