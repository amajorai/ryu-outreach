import { describe, expect, it } from "bun:test";
import { demoState, normalizeState, recipientSendIntent } from "./model.ts";
import {
	outreachMailInboxSchema,
	outreachMailSendReplySchema,
	storedRecipientFieldsSchema,
} from "./schemas.ts";

describe("Outreach native and persisted boundaries", () => {
	it("keeps missing send intents optional in old stored contacts", () => {
		const recipient = storedRecipientFieldsSchema.parse({
			email: "a@example.com",
		});
		expect(recipient.sendIntent).toBeUndefined();
		const state = normalizeState({
			campaigns: [
				{ name: "Contacts", recipients: [null, { email: " A@Example.com " }] },
			],
		});
		expect(state.campaigns[0]?.recipients).toEqual([
			{
				company: "Independent",
				email: "a@example.com",
				id: "recipient-1",
				name: "a",
				role: "Contact",
				status: "ready",
			},
		]);
	});
	it("retains unresolved-send guards on invalid stored recipients and campaigns", () => {
		expect(() =>
			normalizeState({
				campaigns: [
					{
						name: "Contacts",
						recipients: [{ email: "bad", sendIntent: null }],
					},
				],
			})
		).toThrow("Stored send recipient is invalid");
		expect(() =>
			normalizeState({
				campaigns: [
					{ recipients: [{ email: "a@example.com", sendIntent: null }] },
				],
			})
		).toThrow("Stored send campaign is invalid");
		expect(() =>
			normalizeState({
				campaigns: [
					{
						name: "Contacts",
						recipients: [{ email: "a@example.com", sendIntent: null }],
					},
				],
			})
		).toThrow("Stored send intent is invalid");
	});
	it("round trips the durable review and rejects altered payloads", () => {
		const state = demoState();
		const campaign = state.campaigns[0];
		const recipient = campaign?.recipients[0];
		if (!(campaign && recipient)) {
			throw new Error("The native demo campaign must have a recipient");
		}
		const intent = recipientSendIntent("inbox", campaign, recipient);
		recipient.sendIntent = intent;
		expect(normalizeState(JSON.parse(JSON.stringify(state)))).toEqual(state);
		intent.payload.subject = "Changed after review";
		expect(() => normalizeState(state)).toThrow(
			"Stored send intent has changed"
		);
	});
	it("accepts complete native Mail records without replacing their references", () => {
		const inbox = {
			id: "native",
			name: "Research",
			address: "research@example.com",
			provider: "imap",
			created_at: "2026-10-06T00:00:00Z",
			metadata: { lane: "outreach" },
		};
		expect(Object.is(outreachMailInboxSchema.parse(inbox), inbox)).toBe(true);
		const message = {
			id: "accepted",
			inbox_id: "native",
			direction: "outbound",
			message_id: "native-message",
			from_addr: "research@example.com",
			to_addrs: ["a@example.com"],
			cc_addrs: [],
			bcc_addrs: [],
			subject: "Reviewed",
			created_at: "2026-10-06T00:00:00Z",
			attachments: [],
			text: "Reviewed text",
		};
		expect(Object.is(outreachMailSendReplySchema.parse(message), message)).toBe(
			true
		);
		expect(
			outreachMailSendReplySchema.parse({ id: "legacy-accepted" })
		).toEqual({ id: "legacy-accepted" });
	});
});
