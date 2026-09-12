import type {
	Campaign,
	Inbox,
	NewCampaignInput,
	OutreachState,
	Recipient,
	RecipientStatus,
} from "./types.ts";

const VALID_RECIPIENT_STATUSES: RecipientStatus[] = [
	"ready",
	"sent",
	"replied",
	"paused",
];

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function text(value: unknown, fallback = ""): string {
	return typeof value === "string" ? value : fallback;
}

function status(value: unknown): RecipientStatus {
	return typeof value === "string" &&
		VALID_RECIPIENT_STATUSES.includes(value as RecipientStatus)
		? (value as RecipientStatus)
		: "ready";
}

function recipient(value: unknown, index: number): Recipient | null {
	if (!isRecord(value)) {
		return null;
	}
	const email = text(value.email).trim().toLowerCase();
	if (!email?.includes("@")) {
		return null;
	}
	return {
		company: text(value.company, "Independent").trim() || "Independent",
		email,
		id: text(value.id, `recipient-${index}`).trim() || `recipient-${index}`,
		name: text(value.name, email.split("@")[0]).trim() || email,
		role: text(value.role, "Contact").trim() || "Contact",
		status: status(value.status),
	};
}

function campaign(value: unknown, index: number): Campaign | null {
	if (!isRecord(value)) {
		return null;
	}
	const name = text(value.name).trim();
	if (!name) {
		return null;
	}
	const recipients = Array.isArray(value.recipients)
		? value.recipients
				.map((item, itemIndex) => recipient(item, itemIndex))
				.filter((item): item is Recipient => item !== null)
		: [];
	const rawStatus = value.status;
	const normalizedStatus: Campaign["status"] =
		rawStatus === "sent" || rawStatus === "ready" ? rawStatus : "draft";
	return {
		audience: text(value.audience, "A focused audience").trim(),
		body: text(value.body).trim(),
		createdAt: text(value.createdAt, "2026-08-26T08:00:00.000Z"),
		cta: text(value.cta, "Reply if this is useful").trim(),
		id: text(value.id, `campaign-${index}`).trim() || `campaign-${index}`,
		name,
		objective: text(value.objective, "Start a useful conversation").trim(),
		offer: text(value.offer, "A short, useful conversation").trim(),
		recipients,
		status: normalizedStatus,
		subject: text(value.subject, "A useful idea for your team").trim(),
		tone: text(value.tone, "Warm, direct, specific").trim(),
		updatedAt: text(
			value.updatedAt,
			text(value.createdAt, "2026-08-26T08:00:00.000Z")
		),
	};
}

export function emptyState(): OutreachState {
	return { campaigns: [], schemaVersion: 1, settings: { modelId: "" } };
}

export function normalizeState(value: unknown): OutreachState {
	if (!isRecord(value)) {
		return emptyState();
	}
	const campaigns = Array.isArray(value.campaigns)
		? value.campaigns
				.map((item, index) => campaign(item, index))
				.filter((item): item is Campaign => item !== null)
				.slice(0, 100)
		: [];
	const rawSettings = isRecord(value.settings) ? value.settings : {};
	return {
		campaigns,
		schemaVersion: 1,
		settings: { modelId: text(rawSettings.modelId).trim() },
	};
}

export function serializeState(state: OutreachState): string {
	return JSON.stringify(state);
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
		.map((line, index) => {
			const match = line.match(/^(.+?)\s*<([^>]+)>$/);
			const email = (match?.[2] ?? line).trim().toLowerCase();
			const name = (match?.[1] ?? email.split("@")[0] ?? "Contact").trim();
			return {
				company: "New prospect",
				email,
				id: `recipient-${Date.now()}-${index}`,
				name: name || email,
				role: "Contact",
				status: "ready" as const,
			};
		})
		.filter((item) => item.email.includes("@"));
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
	return new Intl.DateTimeFormat(undefined, {
		day: "numeric",
		month: "short",
	}).format(parsed);
}

export function demoInbox(): Inbox {
	return { address: "hello@ryu.local", id: "demo-inbox", name: "Demo sender" };
}
