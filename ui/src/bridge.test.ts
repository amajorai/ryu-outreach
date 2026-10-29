import { afterEach, describe, expect, it } from "bun:test";
import {
	generateDraft,
	loadOutreachState,
	type RyuBridge,
	saveOutreachState,
	sendRecipientEmail,
} from "./bridge.ts";
import { demoState, emptyState, recipientSendIntent } from "./model.ts";

const originalWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
const originalStorage = Object.getOwnPropertyDescriptor(
	globalThis,
	"localStorage"
);
function setWindow(ryu: RyuBridge): void {
	Object.defineProperty(globalThis, "window", {
		configurable: true,
		writable: true,
		value: { ryu },
	});
}
afterEach(() => {
	if (originalWindow) {
		Object.defineProperty(globalThis, "window", originalWindow);
	} else {
		Reflect.deleteProperty(globalThis, "window");
	}
	if (originalStorage) {
		Object.defineProperty(globalThis, "localStorage", originalStorage);
	} else {
		Reflect.deleteProperty(globalThis, "localStorage");
	}
});

describe("Outreach bridge", () => {
	it("uses a deterministic demo workspace when the host is absent", async () => {
		const result = await loadOutreachState();
		expect(result.mode).toBe("demo");
		expect(result.state.campaigns.length).toBeGreaterThan(0);
	});

	it("recovers from malformed preview storage without leaving preview mode", async () => {
		const storage: Storage = {
			getItem: () => "not-json",
			setItem: () => undefined,
			removeItem: () => undefined,
			clear: () => undefined,
			key: () => null,
			length: 0,
		};
		Object.defineProperty(globalThis, "localStorage", {
			configurable: true,
			value: storage,
		});

		const result = await loadOutreachState();

		expect(result.mode).toBe("demo");
		expect(result.state.campaigns.length).toBeGreaterThan(0);
	});

	it("rejects preview state after a host connects", async () => {
		const calls: Parameters<NonNullable<RyuBridge["storage"]>["set"]>[0][] = [];
		setWindow({
			storage: {
				get: () => Promise.resolve(null),
				set: (input) => {
					calls.push(input);
					return Promise.resolve();
				},
			},
		});
		await expect(saveOutreachState(emptyState(), "demo")).rejects.toThrow(
			"Preview state"
		);
		expect(calls).toHaveLength(0);
	});

	it("starts a live host with an empty node-owned workspace", async () => {
		setWindow({
			storage: {
				get: () => Promise.resolve(null),
				set: () => Promise.resolve(),
			},
		});

		const result = await loadOutreachState();
		expect(result.mode).toBe("live");
		expect(result.state.campaigns).toHaveLength(0);
	});

	it("routes an explicit model id through Ryu's local provider lane", async () => {
		const calls: Parameters<NonNullable<RyuBridge["model"]>["complete"]>[0][] =
			[];
		setWindow({
			model: {
				complete: (input) => {
					calls.push(input);
					return Promise.resolve("Hi {{first_name}},\n\nA useful note.");
				},
			},
		});
		const campaign = {
			audience: "Operators",
			body: "",
			createdAt: "2026-08-26T08:00:00.000Z",
			cta: "Reply",
			id: "c1",
			name: "Operators",
			objective: "Learn",
			offer: "A chat",
			recipients: [],
			status: "draft" as const,
			subject: "Hello",
			tone: "Warm",
			updatedAt: "2026-08-26T08:00:00.000Z",
		};
		await generateDraft(campaign, "Qwen3-8B-Q4_K_M");
		expect(calls[0]).toMatchObject({
			model: "Qwen3-8B-Q4_K_M",
			provider: "local",
		});
	});
});

it("forwards the exact durable personalized intent and key without regenerating it", async () => {
	const state = demoState();
	const campaign = state.campaigns[0]!;
	const intent = recipientSendIntent(
		"inbox-research",
		campaign,
		campaign.recipients[0]!
	);
	const calls: Parameters<NonNullable<RyuBridge["mail"]>["send"]>[0][] = [];
	setWindow({
		mail: {
			list: async () => [],
			send: async (input) => {
				calls.push(input);
				return { id: "accepted" };
			},
		},
	});
	await sendRecipientEmail(intent);
	await sendRecipientEmail(intent);
	expect(calls).toEqual([
		{ ...intent.payload, idempotencyKey: intent.idempotencyKey },
		{ ...intent.payload, idempotencyKey: intent.idempotencyKey },
	]);
});
