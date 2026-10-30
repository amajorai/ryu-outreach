import { describe, expect, it } from "bun:test";
import {
	buildDraftPrompt,
	campaignProgress,
	demoState,
	normalizeState,
	parseRecipientLines,
	patchSendIntent,
	personalize,
	recipientSendIntent,
	serializeState,
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
			parseRecipientLines(
				"Maya Chen <maya@example.com>\nsam@example.com\nnot-an-email\nmissing-domain@example"
			)
		).toMatchObject([
			{ email: "maya@example.com", name: "Maya Chen", status: "ready" },
			{ email: "sam@example.com", name: "sam", status: "ready" },
		]);
	});

	it("drops persisted recipient rows with malformed email addresses", () => {
		const state = normalizeState({
			campaigns: [
				{
					name: "Malformed address",
					recipients: [
						{ email: "person@example.com" },
						{ email: "person@localhost" },
					],
				},
			],
		});

		expect(state.campaigns[0]?.recipients.map((item) => item.email)).toEqual([
			"person@example.com",
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

it("retains exact personalized send intent and stable key through save/reload and rejects changed unresolved input", () => {
	const state = demoState();
	const campaign = state.campaigns[0]!;
	const recipient = campaign.recipients[0]!;
	const intent = recipientSendIntent("inbox-research", campaign, recipient);
	expect(intent.payload).toEqual({
		inboxId: "inbox-research",
		subject: campaign.subject,
		text: personalize(campaign.body, recipient.name),
		to: [recipient.email],
	});
	expect(intent.idempotencyKey).toMatch(/^[0-9a-f-]{36}$/);
	const pending = patchSendIntent(state, campaign.id, recipient.id, intent);
	expect(normalizeState(JSON.parse(serializeState(pending)))).toEqual(pending);
	const restored = normalizeState(JSON.parse(serializeState(pending)))
		.campaigns[0]!;
	expect(
		recipientSendIntent("inbox-research", restored, restored.recipients[0]!)
	).toEqual(intent);
	expect(() =>
		recipientSendIntent("other-inbox", restored, restored.recipients[0]!)
	).toThrow("unresolved send");
	expect(() =>
		recipientSendIntent(
			"inbox-research",
			{ ...restored, subject: "Edited" },
			restored.recipients[0]!
		)
	).toThrow("unresolved send");
	expect(() =>
		recipientSendIntent(
			"inbox-research",
			{ ...restored, body: "Edited" },
			restored.recipients[0]!
		)
	).toThrow("unresolved send");
	expect(pending.campaigns[1]).toEqual(state.campaigns[1]);
	expect(normalizeState(state)).toEqual(state);
	const corrupt = structuredClone(pending);
	corrupt.campaigns[0]!.recipients[0]!.sendIntent!.payload.text = "changed";
	expect(() => normalizeState(corrupt)).toThrow("send intent has changed");
});

it("refuses invalid retry timestamps and retains old unresolved keys", () => {
	const state = demoState();
	const campaign = state.campaigns[0]!;
	const recipient = campaign.recipients[0]!;
	const intent = recipientSendIntent("inbox-research", campaign, recipient);
	for (const createdAt of ["invalid"]) {
		expect(() =>
			recipientSendIntent("inbox-research", campaign, {
				...recipient,
				sendIntent: { ...intent, createdAt },
			})
		).toThrow("invalid review timestamp");
	}
});

it("retains unresolved intent beyond legacy cache expiry", () => {
	const campaign = demoState().campaigns[0]!;
	const recipient = campaign.recipients[0]!;
	const intent = {
		...recipientSendIntent("inbox-research", campaign, recipient),
		createdAt: new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString(),
	};
	expect(
		recipientSendIntent("inbox-research", campaign, {
			...recipient,
			sendIntent: intent,
		})
	).toEqual(intent);
});
