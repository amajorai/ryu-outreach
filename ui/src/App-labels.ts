import type { AppMode } from "./bridge.ts";
import type { Campaign, Recipient } from "./types.ts";

export type Filter = "all" | "draft" | "ready" | "sent";

export const FILTERS: Array<{ id: Filter; label: string }> = [
	{ id: "all", label: "All" },
	{ id: "draft", label: "Drafts" },
	{ id: "ready", label: "Ready" },
	{ id: "sent", label: "Sent" },
];

export interface NewCampaignForm {
	audience: string;
	name: string;
	objective: string;
	recipients: string;
}

export const EMPTY_FORM: NewCampaignForm = {
	audience: "",
	name: "",
	objective: "",
	recipients: "",
};

export function errorMessage(cause: unknown): string {
	return cause instanceof Error
		? cause.message
		: "Something went wrong. Try again.";
}

export function campaignStatusLabel(campaign: Campaign): string {
	if (campaign.status === "sent") {
		return "Sent";
	}
	if (campaign.status === "ready") {
		return "Ready";
	}
	return "Draft";
}

export function campaignStatusVariant(
	campaign: Campaign
): "default" | "secondary" | "outline" {
	if (campaign.status === "sent") {
		return "secondary";
	}
	if (campaign.status === "ready") {
		return "default";
	}
	return "outline";
}

export function recipientStatusLabel(recipient: Recipient): string {
	if (recipient.status === "ready" && recipient.sendIntent) {
		return "Needs reconciliation";
	}
	if (recipient.status === "replied") {
		return "Replied";
	}
	if (recipient.status === "sent") {
		return "Sent";
	}
	if (recipient.status === "paused") {
		return "Paused";
	}
	return "Ready";
}

export function recipientStatusVariant(
	recipient: Recipient
): "default" | "secondary" | "outline" {
	if (recipient.status === "sent" || recipient.status === "replied") {
		return "secondary";
	}
	if (recipient.status === "paused") {
		return "outline";
	}
	return "default";
}

export function matchesFilter(campaign: Campaign, filter: Filter): boolean {
	return filter === "all" || campaign.status === filter;
}

export function activeRecipients(
	campaign: Campaign | null,
	ids: ReadonlySet<string>
): Recipient[] {
	return (
		campaign?.recipients.filter((recipient) => ids.has(recipient.id)) ?? []
	);
}

export function modeCopy(mode: AppMode): { label: string; detail: string } {
	return mode === "demo"
		? { detail: "Sends stay in this preview", label: "Preview" }
		: { detail: "State stays on this Ryu node", label: "Node-owned" };
}
