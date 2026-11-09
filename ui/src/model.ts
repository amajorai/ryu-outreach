import { formatDate } from "@ryu/ui/lib/timezone.ts";
import type { z } from "zod";
import {
	outreachEmailPattern,
	type storedCampaignValidationSchema,
	storedOutreachInputSchema,
	type storedRecipientValidationSchema,
	storedSendIntentFieldsSchema,
} from "./schemas.ts";
import type {
	Campaign,
	Inbox,
	NewCampaignInput,
	OutreachState,
	Recipient,
	RecipientStatus,
	SendIntent,
} from "./types.ts";

const EMAIL_ADDRESS_PATTERN = outreachEmailPattern;

function recipient(
	value: z.output<typeof storedRecipientValidationSchema>,
	index: number
): Recipient | null {
	if (!value.success) {
		return null;
	}
	const row = value.data;
	const email = (row.email ?? "").trim().toLowerCase();
	if (!EMAIL_ADDRESS_PATTERN.test(email)) {
		if (row.sendIntent?.provided) {
			throw new Error(
				"Stored send recipient is invalid. Reconcile Mail before editing."
			);
		}
		return null;
	}
	const result: Recipient = {
		company: (row.company ?? "Independent").trim() || "Independent",
		email,
		id: (row.id ?? `recipient-${index}`).trim() || `recipient-${index}`,
		name: (row.name ?? email.split("@")[0] ?? "").trim() || email,
		role: (row.role ?? "Contact").trim() || "Contact",
		status: row.status,
	};
	if (row.sendIntent?.provided) {
		if (!row.sendIntent.validation.success) {
			throw new Error(
				"Stored send intent is invalid. Reconcile Mail before sending."
			);
		}
		result.sendIntent = normalizeSendIntent(row.sendIntent.validation.data);
	}
	return result;
}

function campaign(
	value: z.output<typeof storedCampaignValidationSchema>,
	index: number
): Campaign | null {
	if (!value.success) {
		return null;
	}
	const row = value.data;
	const name = (row.name ?? "").trim();
	if (!name) {
		if (
			row.recipients.some(
				(item) => item.success && item.data.sendIntent?.provided
			)
		) {
			throw new Error(
				"Stored send campaign is invalid. Reconcile Mail before editing."
			);
		}
		return null;
	}
	if (row.recipients.length > 10_000) {
		throw new Error(
			"Campaign exceeds the safe recipient limit. Reconcile stored sends before editing."
		);
	}
	const recipients = row.recipients
		.map((item, itemIndex) => recipient(item, itemIndex))
		.filter((item): item is Recipient => item !== null);
	return {
		audience: (row.audience ?? "A focused audience").trim(),
		body: (row.body ?? "").trim(),
		createdAt: row.createdAt ?? "2026-08-26T08:00:00.000Z",
		cta: (row.cta ?? "Reply if this is useful").trim(),
		id: (row.id ?? `campaign-${index}`).trim() || `campaign-${index}`,
		name,
		objective: (row.objective ?? "Start a useful conversation").trim(),
		offer: (row.offer ?? "A short, useful conversation").trim(),
		recipients,
		status: row.status,
		subject: (row.subject ?? "A useful idea for your team").trim(),
		tone: (row.tone ?? "Warm, direct, specific").trim(),
		updatedAt: row.updatedAt ?? row.createdAt ?? "2026-08-26T08:00:00.000Z",
	};
}

export function sendFingerprint(payload: SendIntent["payload"]): string {
	return JSON.stringify([
		payload.inboxId,
		payload.subject,
		payload.text,
		payload.to,
	]);
}

function normalizeSendIntent(
	value: z.input<typeof storedSendIntentFieldsSchema>
): SendIntent {
	const parsed = storedSendIntentFieldsSchema.safeParse(value);
	if (!parsed.success) {
		throw new Error(
			"Stored send intent is invalid. Reconcile Mail before sending."
		);
	}
	const result = parsed.data;
	if (result.fingerprint !== sendFingerprint(result.payload)) {
		throw new Error(
			"Stored send intent has changed. Reconcile Mail before sending."
		);
	}
	return {
		campaignId: result.campaignId,
		recipientId: result.recipientId,
		idempotencyKey: result.idempotencyKey,
		createdAt: result.createdAt,
		status: result.status,
		payload: {
			inboxId: result.payload.inboxId,
			subject: result.payload.subject,
			text: result.payload.text,
			to: [result.payload.to[0]],
		},
		fingerprint: result.fingerprint,
	};
}

export function recipientSendIntent(
	inboxId: string,
	campaign: Campaign,
	recipient: Recipient
): SendIntent {
	const payload: SendIntent["payload"] = {
		inboxId,
		subject: campaign.subject,
		text: personalize(campaign.body, recipient.name),
		to: [recipient.email],
	};
	const previous = recipient.sendIntent;
	if (previous) {
		const age = Date.now() - Date.parse(previous.createdAt);
		if (!Number.isFinite(age) || age < 0) {
			throw new Error(
				"This send has an invalid review timestamp. Reconcile its Mail record before any further send."
			);
		}
		if (
			previous.campaignId !== campaign.id ||
			previous.recipientId !== recipient.id ||
			previous.fingerprint !== sendFingerprint(payload)
		) {
			throw new Error(
				"This recipient has an unresolved send. Restore the original inbox and message to reconcile it; editing cannot start a new send."
			);
		}
		return previous;
	}
	return normalizeSendIntent({
		campaignId: campaign.id,
		recipientId: recipient.id,
		idempotencyKey: crypto.randomUUID(),
		createdAt: new Date().toISOString(),
		status: "pending",
		payload,
		fingerprint: sendFingerprint(payload),
	});
}

export function patchSendIntent(
	state: OutreachState,
	campaignId: string,
	recipientId: string,
	intent: SendIntent
): OutreachState {
	return {
		...state,
		campaigns: state.campaigns.map((item) =>
			item.id === campaignId
				? {
						...item,
						recipients: item.recipients.map((row) =>
							row.id === recipientId ? { ...row, sendIntent: intent } : row
						),
					}
				: item
		),
	};
}

export function emptyState(): OutreachState {
	return { campaigns: [], schemaVersion: 1, settings: { modelId: "" } };
}

export function normalizeState(
	value: z.input<typeof storedOutreachInputSchema>
): OutreachState {
	const parsed = storedOutreachInputSchema.safeParse(value);
	if (!parsed.success) {
		return emptyState();
	}
	const row = parsed.data;
	if (JSON.stringify(value).length > 2_000_000 || row.campaigns.length > 100) {
		throw new Error(
			"Outreach state exceeds its safe limit. Reconcile stored sends before editing."
		);
	}
	const campaigns = row.campaigns
		.map((item, index) => campaign(item, index))
		.filter((item): item is Campaign => item !== null)
		.slice(0, 100);
	return {
		campaigns,
		schemaVersion: 1,
		settings: { modelId: (row.settings?.modelId ?? "").trim() },
	};
}

export function serializeState(state: OutreachState): string {
	const value = JSON.stringify(state);
	if (
		value.length > 2_000_000 ||
		state.campaigns.length > 100 ||
		state.campaigns.some((item) => item.recipients.length > 10_000)
	) {
		throw new Error(
			"Outreach state exceeds its safe limit. Reconcile stored sends before editing."
		);
	}
	return value;
}

function demoRecipient(
	id: string,
	name: string,
	company: string,
	role: string,
	email: string,
	status: RecipientStatus
): Recipient {
	return { company, email, id, name, role, status };
}

export function demoState(): OutreachState {
	return normalizeState({
		campaigns: [
			{
				audience: "SaaS founders · 10–50 person teams",
				body: "Hi {{first_name}},\n\nI noticed Northstar is building a thoughtful workflow for small teams. We are opening a few design-partner spots for Ryu's local-first agent workspace.\n\nWould a 20-minute conversation be useful? I can share the short brief and learn what your team would need.\n\nBest,\nJiawei",
				createdAt: "2026-08-26T08:00:00.000Z",
				cta: "Reply if a short conversation is useful",
				id: "demo-design-partners",
				name: "Design partners · workflow beta",
				objective: "Find five teams willing to shape the workflow beta",
				offer: "A 20-minute feedback session and early access",
				recipients: [
					demoRecipient(
						"maya",
						"Maya Chen",
						"Northstar Labs",
						"Founder",
						"maya@northstar.example",
						"ready"
					),
					demoRecipient(
						"sam",
						"Sam Rivera",
						"Relay Systems",
						"COO",
						"sam@relay.example",
						"ready"
					),
					demoRecipient(
						"jules",
						"Jules Park",
						"Greenline",
						"Product lead",
						"jules@greenline.example",
						"sent"
					),
				],
				status: "ready",
				subject: "Would your workflow team try this?",
				tone: "Warm, direct, specific",
				updatedAt: "2026-08-26T10:30:00.000Z",
			},
			{
				audience: "Operators who already use Ryu",
				body: "",
				createdAt: "2026-08-25T14:00:00.000Z",
				cta: "Ask for a reply",
				id: "demo-operator-follow-up",
				name: "Operator follow-up",
				objective:
					"Reconnect with people who asked for a practical walkthrough",
				offer: "A tailored walkthrough",
				recipients: [
					demoRecipient(
						"lee",
						"Lee Tan",
						"Morrow",
						"Head of Ops",
						"lee@morrow.example",
						"ready"
					),
					demoRecipient(
						"nora",
						"Nora Patel",
						"Fieldnote",
						"Founder",
						"nora@fieldnote.example",
						"paused"
					),
				],
				status: "draft",
				subject: "A practical Ryu walkthrough",
				tone: "Helpful, concise",
				updatedAt: "2026-08-25T14:00:00.000Z",
			},
			{
				audience: "Early readers of the launch note",
				body: "Thanks for following the launch. If local inference is part of your setup, I would love to hear what you are building.",
				createdAt: "2026-08-23T09:00:00.000Z",
				cta: "Tell us what you are building",
				id: "demo-launch-replies",
				name: "Launch note replies",
				objective: "Learn which local workflows are most urgent",
				offer: "A short research conversation",
				recipients: [
					demoRecipient(
						"devon",
						"Devon Lee",
						"Arcade",
						"Engineering",
						"devon@arcade.example",
						"replied"
					),
				],
				status: "sent",
				subject: "What are you building locally?",
				tone: "Curious, low-pressure",
				updatedAt: "2026-08-24T11:15:00.000Z",
			},
		],
		settings: { modelId: "" },
	});
}

export function parseRecipientLines(value: string): Recipient[] {
	return value
		.split(/[\n,]+/)
		.map((line) => line.trim())
		.filter(Boolean)
		.flatMap((line, index) => {
			const match = line.match(/^(.+?)\s*<([^>]+)>$/);
			const email = (match?.[2] ?? line).trim().toLowerCase();
			if (!EMAIL_ADDRESS_PATTERN.test(email)) {
				return [];
			}
			const name = (match?.[1] ?? email.split("@")[0] ?? "Contact").trim();
			return [
				{
					company: "New prospect",
					email,
					id: `recipient-${Date.now()}-${index}`,
					name: name || email,
					role: "Contact",
					status: "ready" as const,
				},
			];
		});
}

export function createCampaign(input: NewCampaignInput): Campaign {
	const now = new Date().toISOString();
	return {
		audience: input.audience.trim() || "A focused audience",
		body: "",
		createdAt: now,
		cta: "Reply if this is useful",
		id: `campaign-${Date.now()}`,
		name: input.name.trim(),
		objective: input.objective.trim() || "Start a useful conversation",
		offer: "A short, useful conversation",
		recipients: input.recipients,
		status: "draft",
		subject: "A useful idea for your team",
		tone: "Warm, direct, specific",
		updatedAt: now,
	};
}

export function patchCampaign(
	state: OutreachState,
	campaignId: string,
	patch: Partial<Campaign>
): OutreachState {
	return {
		...state,
		campaigns: state.campaigns.map((item) =>
			item.id === campaignId
				? { ...item, ...patch, updatedAt: new Date().toISOString() }
				: item
		),
	};
}

export function patchRecipients(
	state: OutreachState,
	campaignId: string,
	recipientIds: ReadonlySet<string>,
	newStatus: RecipientStatus
): OutreachState {
	return patchCampaign(state, campaignId, {
		recipients:
			state.campaigns
				.find((item) => item.id === campaignId)
				?.recipients.map((item) =>
					recipientIds.has(item.id) ? { ...item, status: newStatus } : item
				) ?? [],
	});
}

export function personalize(body: string, recipientName: string): string {
	const firstName = recipientName.trim().split(/\s+/)[0] ?? recipientName;
	return body.replaceAll("{{first_name}}", firstName);
}

export function buildDraftPrompt(campaign: Campaign): string {
	return [
		"Write one concise outbound email for the campaign below.",
		"Keep it specific, human, and low-pressure. Do not invent facts about the recipient.",
		"Return only the email body, with no subject line and no markdown fences.",
		JSON.stringify({
			audience: campaign.audience,
			cta: campaign.cta,
			objective: campaign.objective,
			offer: campaign.offer,
			recipient_placeholders:
				"Use {{first_name}} for the greeting when useful.",
			tone: campaign.tone,
		}),
	].join("\n\n");
}

export function cleanModelDraft(value: string): string {
	return value
		.trim()
		.replace(/^```(?:text|markdown)?\s*/i, "")
		.replace(/\s*```$/, "")
		.trim();
}

export function campaignProgress(campaign: Campaign): number {
	if (campaign.recipients.length === 0) {
		return 0;
	}
	const complete = campaign.recipients.filter(
		(item) => item.status === "sent" || item.status === "replied"
	).length;
	return Math.round((complete / campaign.recipients.length) * 100);
}

export function campaignStats(campaigns: Campaign[]) {
	const recipients = campaigns.flatMap((campaign) => campaign.recipients);
	return {
		active: campaigns.filter((campaign) => campaign.status !== "sent").length,
		drafts: campaigns.filter((campaign) => campaign.status === "draft").length,
		ready: recipients.filter((recipient) => recipient.status === "ready")
			.length,
		sent: recipients.filter(
			(recipient) =>
				recipient.status === "sent" || recipient.status === "replied"
		).length,
	};
}

export function formatShortDate(value: string): string {
	const parsed = new Date(value);
	if (Number.isNaN(parsed.getTime())) {
		return "Recently";
	}
	return formatDate(parsed, { day: "numeric", month: "short" });
}

export function demoInbox(): Inbox {
	return { address: "hello@ryu.local", id: "demo-inbox", name: "Demo sender" };
}
