import { describe, expect, it } from "bun:test";
import {
	buildDraftPrompt,
	campaignProgress,
	demoState,
	normalizeState,
	parseRecipientLines,
	personalize,
} from "./model.ts";

describe("outreach model", () => {
	it("normalizes malformed persisted state without losing valid campaigns", () => {
		const state = normalizeState({
			campaigns: [
				{ name: "Valid", recipients: [{ id: "r1", email: "A@EXAMPLE.COM" }] },
				{ name: "", recipients: [] },
				{ name: "Invalid recipient", recipients: [{ email: "not-an-email" }] },
			],
			settings: { modelId: " Qwen3 " },
		});
		expect(state.campaigns).toHaveLength(2);
		expect(state.campaigns[0]?.recipients[0]?.email).toBe("a@example.com");
		expect(state.settings.modelId).toBe("Qwen3");
	});

	it("keeps personalization local to the send edge", () => {
		expect(personalize("Hi {{first_name}},\n\nWelcome.", "Maya Chen")).toBe(
			"Hi Maya,\n\nWelcome."
		);
	});

	it("parses reviewed recipient lines", () => {
		expect(
			parseRecipientLines("Maya Chen <maya@example.com>\nsam@example.com")
		).toMatchObject([
			{ email: "maya@example.com", name: "Maya Chen", status: "ready" },
			{ email: "sam@example.com", name: "sam", status: "ready" },
		]);
	});

	it("computes completion from sent and replied states", () => {
		const campaign = demoState().campaigns[0];
		expect(campaign).toBeDefined();
		expect(campaignProgress(campaign!)).toBe(33);
	});

	it("builds a bounded model prompt without recipient email addresses", () => {
		const campaign = demoState().campaigns[0]!;
		const prompt = buildDraftPrompt(campaign);
		expect(prompt).toContain("{{first_name}}");
		expect(prompt).toContain(campaign.objective);
		expect(prompt).not.toContain("maya@northstar.example");
	});
});
