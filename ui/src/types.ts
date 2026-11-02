export type CampaignStatus = "draft" | "ready" | "sent";
export type RecipientStatus = "ready" | "sent" | "replied" | "paused";

export interface SendIntent {
	campaignId: string;
	createdAt: string;
	fingerprint: string;
	idempotencyKey: string;
	payload: { inboxId: string; subject: string; text: string; to: [string] };
	recipientId: string;
	status: "pending" | "accepted" | "uncertain";
}

export interface Recipient {
	company: string;
	email: string;
	id: string;
	name: string;
	role: string;
	sendIntent?: SendIntent;
	status: RecipientStatus;
}

export interface Campaign {
	audience: string;
	body: string;
	createdAt: string;
	cta: string;
	id: string;
	name: string;
	objective: string;
	offer: string;
	recipients: Recipient[];
	status: CampaignStatus;
	subject: string;
	tone: string;
	updatedAt: string;
}

export interface OutreachSettings {
	modelId: string;
}

export interface OutreachState {
	campaigns: Campaign[];
	schemaVersion: 1;
	settings: OutreachSettings;
}

export interface NewCampaignInput {
	audience: string;
	name: string;
	objective: string;
	recipients: Recipient[];
}

export interface Inbox {
	address: string;
	id: string;
	name: string;
}
