import { afterEach, describe, expect, it } from "bun:test";
import {
	generateDraft,
	loadOutreachState,
	saveOutreachState,
} from "./bridge.ts";
import { emptyState } from "./model.ts";

afterEach(() => {
	(globalThis as { window?: unknown }).window = undefined;
});

describe("Outreach bridge", () => {
	it("uses a deterministic demo workspace when the host is absent", async () => {
		const result = await loadOutreachState();
		expect(result.mode).toBe("demo");
		expect(result.state.campaigns.length).toBeGreaterThan(0);
	});

	it("does not call the host storage for demo state", async () => {
		const calls: unknown[] = [];
		(globalThis as { window?: unknown }).window = {
			ryu: {
				storage: {
					set: (input: unknown) => {
						calls.push(input);
						return Promise.resolve();
					},
				},
			},
		};
		await saveOutreachState(emptyState(), "demo");
		expect(calls).toHaveLength(0);
	});

	it("routes an explicit model id through Ryu's local provider lane", async () => {
		const calls: unknown[] = [];
		(globalThis as { window?: unknown }).window = {
			ryu: {
				model: {
					complete: (input: unknown) => {
						calls.push(input);
						return Promise.resolve("Hi {{first_name}},\n\nA useful note.");
					},
				},
			},
		};
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
