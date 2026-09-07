import type { RyuCatalogSnapshot } from "@ryu/app-host/app-bridge";
import {
	buildDraftPrompt,
	cleanModelDraft,
	demoInbox,
	demoState,
	emptyState,
	normalizeState,
	personalize,
	serializeState,
} from "./model.ts";
import type { Campaign, Inbox, OutreachState, Recipient } from "./types.ts";

const STORAGE_NAMESPACE = "outreach";
const STORAGE_KEY = "state.v1";
const LOCAL_STORAGE_KEY = "ryu.outreach.state.v1";

interface RyuStorage {
	get(input: { key: string; namespace?: string }): Promise<string | null>;
	set(input: { key: string; namespace?: string; value: string }): Promise<void>;
}

interface RyuModel {
	complete(input: {
		effort?: string;
		model?: string;
		prompt: string;
		provider?: string;
		system?: string;
	}): Promise<string>;
}

interface RyuMail {
	list(): Promise<unknown>;
	send(input: {
		inboxId: string;
		subject: string;
		text?: string;
		to: string[];
	}): Promise<unknown>;
}

interface RyuToast {
	show(input: {
		description?: string;
		title: string;
		variant?: "default" | "success" | "error" | "info";
	}): Promise<string>;
}

export interface RyuBridge {
	catalog?: { snapshot(): Promise<RyuCatalogSnapshot> };
	mail?: RyuMail;
	model?: RyuModel;
	storage?: RyuStorage;
	ui?: { toast?: RyuToast };
}

declare global {
	interface Window {
		ryu?: RyuBridge;
	}
}

export type AppMode = "demo" | "live";

function bridge(): RyuBridge | null {
	return typeof window === "undefined" ? null : (window.ryu ?? null);
}

function localGet(): string | null {
	try {
		return globalThis.localStorage.getItem(LOCAL_STORAGE_KEY);
	} catch {
		return null;
	}
}

function localSet(value: string): void {
	try {
		globalThis.localStorage.setItem(LOCAL_STORAGE_KEY, value);
	} catch {
		// Null-origin previews may not expose localStorage; the live host store remains authoritative.
	}
}

function object(value: unknown): Record<string, unknown> | null {
	return typeof value === "object" && value !== null && !Array.isArray(value)
		? (value as Record<string, unknown>)
		: null;
}

function inboxes(value: unknown): Inbox[] {
	const rows = Array.isArray(value) ? value : (object(value)?.inboxes ?? []);
	if (!Array.isArray(rows)) {
		return [];
	}
	return rows.flatMap((row, index) => {
		const item = object(row);
		if (!item) {
			return [];
		}
		const id = item.id;
		if (typeof id !== "string" || !id.trim()) {
			return [];
		}
		return [
			{
				address: typeof item.address === "string" ? item.address : "",
				id,
				name:
					typeof item.name === "string" && item.name.trim()
						? item.name
						: `Inbox ${index + 1}`,
			},
		];
	});
}

export async function loadOutreachState(): Promise<{
	mode: AppMode;
	state: OutreachState;
}> {
	const current = bridge();
	if (!current) {
		const stored = localGet();
		return {
			mode: "demo",
			state: stored ? normalizeState(JSON.parse(stored)) : demoState(),
		};
	}
	if (!current.storage) {
		return { mode: "live", state: emptyState() };
	}
	try {
		const stored = await current.storage.get({
			key: STORAGE_KEY,
			namespace: STORAGE_NAMESPACE,
		});
		return {
			mode: "live",
			state: stored ? normalizeState(JSON.parse(stored)) : emptyState(),
		};
	} catch {
		return { mode: "live", state: emptyState() };
	}
}

export async function saveOutreachState(
	state: OutreachState,
	mode: AppMode
): Promise<void> {
	const value = serializeState(state);
	localSet(value);
	if (mode === "demo") {
		return;
	}
	const current = bridge();
	if (!current?.storage) {
		throw new Error("Outreach storage is not available for this app.");
	}
	await current.storage.set({
		key: STORAGE_KEY,
		namespace: STORAGE_NAMESPACE,
		value,
	});
}

export async function loadMailInboxes(): Promise<{
	error: string | null;
	inboxes: Inbox[];
}> {
	const current = bridge();
	if (!current) {
		return { error: null, inboxes: [demoInbox()] };
	}
	if (!current.mail) {
		return {
			error:
				"Mail access is not available. Enable Ryu Mail to send from an inbox.",
			inboxes: [],
		};
	}
	try {
		return { error: null, inboxes: inboxes(await current.mail.list()) };
	} catch (cause) {
		return {
			error:
				cause instanceof Error
					? cause.message
					: "Ryu Mail could not be reached.",
			inboxes: [],
		};
	}
}

export async function loadRuntimeCatalog(): Promise<RyuCatalogSnapshot | null> {
	const current = bridge();
	if (!current?.catalog) {
		return null;
	}
	try {
		return await current.catalog.snapshot();
	} catch {
		return null;
	}
}

export async function generateDraft(
	campaign: Campaign,
	modelId: string
): Promise<string> {
	const current = bridge();
	if (!current?.model) {
		throw new Error("Ryu model generation is not available on this host.");
	}
	const requestedModel = modelId.trim();
	const result = await current.model.complete({
		effort: "low",
		prompt: buildDraftPrompt(campaign),
		system:
			"You are a careful outbound copy editor. Never invent a recipient fact or claim a message was delivered.",
		...(requestedModel ? { model: requestedModel, provider: "local" } : {}),
	});
	const cleaned = cleanModelDraft(result);
	if (!cleaned) {
		throw new Error("The model returned an empty draft.");
	}
	return cleaned;
}

export async function sendRecipientEmail(
	inboxId: string,
	campaign: Campaign,
	recipient: Recipient
): Promise<void> {
	const current = bridge();
	if (!current?.mail) {
		throw new Error("Ryu Mail is not available for this app.");
	}
	await current.mail.send({
		inboxId,
		subject: campaign.subject,
		text: personalize(campaign.body, recipient.name),
		to: [recipient.email],
	});
}

export function notify(input: {
	description?: string;
	title: string;
	variant?: "default" | "success" | "error" | "info";
}): void {
	const show = bridge()?.ui?.toast?.show;
	if (!show) {
		return;
	}
	try {
		void show(input).catch(() => undefined);
	} catch {
		// The bridge can disappear synchronously while a Companion is closing.
	}
}
