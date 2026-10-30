import type { RyuCatalogSnapshot } from "@ryu/app-host/app-bridge";
import type { z } from "zod";
import {
	buildDraftPrompt,
	cleanModelDraft,
	demoInbox,
	demoState,
	emptyState,
	normalizeState,
	serializeState,
} from "./model.ts";
import {
	type OutreachMailInboxReply,
	type OutreachMailSendReply,
	outreachMailSendReplySchema,
	storedInboxReplySchema,
} from "./schemas.ts";
import type { Campaign, Inbox, OutreachState, SendIntent } from "./types.ts";

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
	list(): Promise<OutreachMailInboxReply>;
	send(input: {
		idempotencyKey?: string;
		inboxId: string;
		subject: string;
		text?: string;
		to: string[];
	}): Promise<OutreachMailSendReply>;
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
	return globalThis.window?.ryu ?? null;
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

function parsePreviewState(value: string | null): OutreachState {
	if (!value) {
		return demoState();
	}
	try {
		return normalizeState(JSON.parse(value));
	} catch {
		// Browser preview storage is disposable; keep the companion open with its
		// labelled synthetic workspace when a cache entry is malformed.
		return demoState();
	}
}

function inboxes(value: z.input<typeof storedInboxReplySchema>): Inbox[] {
	const rows = storedInboxReplySchema.parse(value);
	return rows.flatMap((row, index) => {
		if (!(row.success && row.data.id?.trim())) {
			return [];
		}
		const item = row.data;
		return [
			{
				address: item.address ?? "",
				id: item.id ?? "",
				name: item.name?.trim() ? item.name : `Inbox ${index + 1}`,
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
			state: parsePreviewState(stored),
		};
	}
	if (!current.storage) {
		throw new Error("Outreach storage is unavailable. Reload before editing.");
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
		throw new Error("Outreach storage is unavailable. Reload before editing.");
	}
}

export async function saveOutreachState(
	state: OutreachState,
	mode: AppMode
): Promise<void> {
	const value = serializeState(state);
	if (mode === "demo") {
		if (bridge()) {
			throw new Error(
				"Preview state cannot be saved to a connected host. Reload the app."
			);
		}
		localSet(value);
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
	const input: Parameters<RyuModel["complete"]>[0] = {
		effort: "low",
		prompt: buildDraftPrompt(campaign),
		system:
			"You are a careful outbound copy editor. Never invent a recipient fact or claim a message was delivered.",
	};
	if (requestedModel) {
		input.model = requestedModel;
		input.provider = "local";
	}
	const result = await current.model.complete(input);
	const cleaned = cleanModelDraft(result);
	if (!cleaned) {
		throw new Error("The model returned an empty draft.");
	}
	return cleaned;
}

export async function sendRecipientEmail(intent: SendIntent): Promise<void> {
	const current = bridge();
	if (!current?.mail) {
		throw new Error("Ryu Mail is not available for this app.");
	}
	outreachMailSendReplySchema.parse(
		await current.mail.send({
			...intent.payload,
			to: [...intent.payload.to],
			idempotencyKey: intent.idempotencyKey,
		})
	);
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
