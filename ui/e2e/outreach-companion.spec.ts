import { mkdir } from "node:fs/promises";
import path from "node:path";
import type { FrameLocator, Page } from "@playwright/test";
import { expect, test } from "@playwright/test";
import {
	outreachFixtureSendInputSchema,
	outreachFixtureStorageInputSchema,
} from "./fixture-schemas.ts";
import type {
	OutreachFixtureCall,
	OutreachFixtureSnapshot,
} from "./fixture-types.ts";

// Companion-suite recognizes the standard `from "@playwright/test"` browser-spec marker.

declare global {
	interface Window {
		__outreachCopiedText?: string;
		__outreachHostFixture?: {
			calls: OutreachFixtureCall[];
			failNext: Record<string, number>;
			getSnapshot(): OutreachFixtureSnapshot;
		};
	}
}

const EVIDENCE_DIRECTORY = process.env.RYU_APPS_STORE_PROOF_DIR
	? path.resolve(process.env.RYU_APPS_STORE_PROOF_DIR)
	: path.resolve(import.meta.dirname, "evidence");

function appFrame(page: Page): FrameLocator {
	return page.frameLocator('iframe[title="Outreach"]');
}

async function selectFilter(app: FrameLocator, label: string): Promise<void> {
	const visibleTab = app.getByRole("tab", { name: label, exact: true });
	if (await visibleTab.count()) {
		await visibleTab.click();
		return;
	}
	await app.getByRole("button", { name: /Show \d+ more tabs/ }).click();
	await app
		.getByRole("menu", { name: /Show \d+ more tabs/ })
		.getByRole("option", { name: new RegExp(`\\b${label}\\b`) })
		.click();
}

function campaignOptions(app: FrameLocator) {
	return app
		.getByRole("listbox", { name: "Saved campaigns" })
		.getByRole("option");
}

async function snapshot(page: Page): Promise<OutreachFixtureSnapshot> {
	return page.evaluate(() => {
		const fixture = window.__outreachHostFixture;
		if (!fixture) {
			throw new Error("The local Outreach fixture was not installed.");
		}
		return fixture.getSnapshot();
	});
}

async function clearCalls(page: Page): Promise<void> {
	await page.evaluate(() => {
		const fixture = window.__outreachHostFixture;
		if (!fixture) {
			throw new Error("The local Outreach fixture was not installed.");
		}
		fixture.calls.length = 0;
	});
}

async function saveProductScreenshot(
	_page: Page,
	app: FrameLocator,
	name: string
): Promise<void> {
	await mkdir(EVIDENCE_DIRECTORY, { recursive: true });
	await app.locator(".outreach-root").screenshot({
		animations: "disabled",
		path: path.join(EVIDENCE_DIRECTORY, name),
	});
}

test("filters saved campaigns and opens the selected draft", async ({
	page,
}) => {
	await page.goto("/");
	const app = appFrame(page);
	await expect(
		app.getByRole("heading", { name: "Design partners · workflow beta" })
	).toBeVisible();
	await expect(campaignOptions(app)).toHaveCount(3);
	await clearCalls(page);

	await selectFilter(app, "Drafts");
	await expect(campaignOptions(app)).toHaveCount(1);
	await expect(
		campaignOptions(app).filter({ hasText: "Operator follow-up" })
	).toBeVisible();

	await campaignOptions(app).filter({ hasText: "Operator follow-up" }).click();
	await expect(
		app.getByRole("heading", { name: "Operator follow-up" })
	).toBeVisible();
	await expect(
		app.getByText("Reconnect with people who asked for a practical walkthrough")
	).toBeVisible();
	await saveProductScreenshot(page, app, "outreach-filtered-campaigns.png");

	await selectFilter(app, "Sent");
	await expect(campaignOptions(app)).toHaveCount(1);
	await expect(
		campaignOptions(app).filter({ hasText: "Launch note replies" })
	).toBeVisible();
	await selectFilter(app, "All");
	await expect(campaignOptions(app)).toHaveCount(3);

	const fixture = await snapshot(page);
	expect(fixture.calls).toEqual([]);
});

test("drafts through the local model, retries a failure, and copies the saved body", async ({
	page,
}) => {
	await page.goto("/?modelFailures=1");
	const app = appFrame(page);
	await expect(
		app.getByRole("heading", { name: "Design partners · workflow beta" })
	).toBeVisible();
	await clearCalls(page);

	const draftButton = app.getByRole("button", { name: "Draft with Ryu" });
	await draftButton.click();
	await expect(app.getByRole("alert")).toContainText(
		"Fixture model temporarily unavailable."
	);
	await expect(draftButton).toBeEnabled();

	await app.getByRole("button", { name: "Draft with Ryu" }).click();
	await expect(app.getByLabel("Campaign body")).toHaveValue(
		"Hi {{first_name}},\n\nWould a short research conversation be useful?"
	);
	await expect(app.getByRole("button", { name: "Copy" })).toBeEnabled();

	const afterDraft = await snapshot(page);
	const modelCalls = afterDraft.calls.filter(
		(call) => call.method === "model.complete"
	);
	expect(modelCalls).toHaveLength(2);
	expect(modelCalls[0]?.input).toMatchObject({
		effort: "low",
		prompt: expect.stringContaining(
			"Find five teams willing to shape the workflow beta"
		),
		system: expect.stringContaining("Never invent a recipient fact"),
	});
	expect(JSON.stringify(modelCalls[0]?.input)).not.toContain(
		"maya@northstar.example"
	);
	expect(afterDraft.state.campaigns[0]).toMatchObject({
		body: "Hi {{first_name}},\n\nWould a short research conversation be useful?",
		status: "ready",
	});

	await app.locator("body").evaluate((body) => {
		const frameWindow = body.ownerDocument.defaultView;
		if (!frameWindow) {
			throw new Error("The Outreach frame has no window.");
		}
		Object.defineProperty(frameWindow.navigator, "clipboard", {
			configurable: true,
			value: {
				writeText: async (value: string) => {
					frameWindow.__outreachCopiedText = value;
				},
			},
		});
	});
	await app.getByRole("button", { name: "Copy" }).click();
	const copiedText = await app
		.locator("body")
		.evaluate((body) => body.ownerDocument.defaultView?.__outreachCopiedText);
	expect(copiedText).toBe(
		"Hi {{first_name}},\n\nWould a short research conversation be useful?"
	);
	const afterCopy = await snapshot(page);
	expect(
		afterCopy.calls.filter((call) => call.method === "ui.toast.show")
	).toContainEqual(
		expect.objectContaining({
			input: expect.objectContaining({ title: "Draft copied" }),
		})
	);
	await saveProductScreenshot(page, app, "outreach-reviewed-draft.png");
});

test("validates, creates, dismisses the dialog, and reads back an empty-workspace campaign", async ({
	page,
}) => {
	await page.goto("/?empty=1");
	const app = appFrame(page);
	await expect(
		app.getByRole("heading", { name: "Your next conversation belongs here" })
	).toBeVisible();
	await app.getByRole("button", { name: "Create campaign" }).click();
	await expect(app.getByRole("dialog")).toBeVisible();
	await app.getByLabel("Campaign name").fill("Partner interviews");
	await app.getByLabel("Recipients").fill("not-an-email");
	await app.getByLabel("Campaign name").press("Enter");
	await expect(app.getByRole("dialog")).toBeVisible();
	await expect(app.getByRole("alert")).toContainText(
		"Add at least one valid recipient email."
	);
	await expect(app.getByRole("dialog")).toBeVisible();
	await app
		.getByLabel("Recipients")
		.fill("Maya Chen <maya@example.com>\ninvalid-address");
	await app.getByLabel("Campaign name").press("Enter");
	await expect(app.getByRole("alert")).toContainText(
		"Check each recipient email address."
	);

	await app.getByLabel("Audience").fill("Small product teams");
	await app
		.getByLabel("Objective")
		.fill("Learn where the onboarding workflow gets stuck");
	await app
		.getByLabel("Recipients")
		.fill("Maya Chen <maya@example.com>\nAri Patel <ari@example.com>");
	const dialogCreateButton = app
		.getByRole("dialog")
		.getByRole("button", { name: "Create campaign" });
	await expect(dialogCreateButton).toHaveAttribute("type", "submit");
	await dialogCreateButton.click();
	await expect(app.getByRole("dialog")).toBeHidden();
	await expect(
		app.getByRole("heading", { name: "Partner interviews" })
	).toBeVisible();

	const fixture = await snapshot(page);
	expect(fixture.state.campaigns).toHaveLength(1);
	expect(fixture.state.campaigns[0]).toMatchObject({
		audience: "Small product teams",
		name: "Partner interviews",
		objective: "Learn where the onboarding workflow gets stuck",
		recipients: [
			{ email: "maya@example.com", name: "Maya Chen", status: "ready" },
			{ email: "ari@example.com", name: "Ari Patel", status: "ready" },
		],
	});
	await saveProductScreenshot(page, app, "outreach-campaign-created.png");

	await clearCalls(page);
	await app.getByLabel("Campaign body").fill("");
	await app.getByRole("button", { name: "Send 2 reviewed" }).click();
	await expect(app.getByRole("alert")).toContainText(
		"Add a subject and draft body before sending."
	);
	await app.getByRole("button", { name: "Dismiss" }).click();
	await expect(app.getByRole("alert")).toHaveCount(0);
	const dismissed = await snapshot(page);
	expect(dismissed.calls.filter((call) => call.method === "mail.send")).toEqual(
		[]
	);
});

test("selects an inbox, sends only checked recipients, and persists the model setting on blur", async ({
	page,
}) => {
	await page.goto("/");
	const app = appFrame(page);
	await expect(
		app.getByRole("heading", { name: "Design partners · workflow beta" })
	).toBeVisible();
	await clearCalls(page);

	const inboxSelect = app.getByLabel("Sending inbox");
	await inboxSelect.selectOption("inbox-partnerships");
	await expect(app.getByText("Ryu Mail transport selected")).toBeVisible();

	await app.getByRole("button", { name: "Clear selection" }).click();
	await expect(
		app.getByRole("button", { name: "Select ready", exact: true })
	).toBeVisible();
	await app.getByRole("button", { name: "Select ready", exact: true }).click();
	await expect(app.getByText("2 selected", { exact: true })).toBeVisible();
	await app.getByRole("button", { name: "Clear selection" }).click();
	await expect(
		app.getByRole("button", { name: "Select ready", exact: true })
	).toBeVisible();
	const maya = app.getByRole("checkbox", { name: /Maya Chen/ });
	await maya.check();
	await expect(app.getByText("1 selected", { exact: true })).toBeVisible();
	await app.getByRole("button", { name: "Send 1 reviewed" }).click();
	await expect(app.getByRole("checkbox", { name: /Maya Chen/ })).toBeDisabled();

	const afterSend = await snapshot(page);
	expect(
		afterSend.calls
			.filter((call) => call.method === "mail.send")
			.map((call) => call.input)
	).toEqual([
		{
			idempotencyKey: afterSend.state.campaigns[0]?.recipients.find(
				(row) => row.id === "maya"
			)?.sendIntent?.idempotencyKey,
			inboxId: "inbox-partnerships",
			subject: "Would your workflow team try this?",
			text: "Hi Maya,\n\nI noticed Northstar is building a thoughtful workflow for small teams. We are opening a few design-partner spots for Ryu's local-first agent workspace.\n\nWould a 20-minute conversation be useful? I can share the short brief and learn what your team would need.\n\nBest,\nJiawei",
			to: ["maya@northstar.example"],
		},
	]);
	expect(afterSend.state.campaigns[0]?.recipients).toContainEqual(
		expect.objectContaining({ id: "maya", status: "sent" })
	);
	expect(afterSend.state.campaigns[0]?.recipients).toContainEqual(
		expect.objectContaining({ id: "sam", status: "ready" })
	);

	await app.getByLabel("Mesh LLM model id").fill("qwen3-local");
	await app.getByLabel("Mesh LLM model id").press("Tab");
	await expect
		.poll(async () => (await snapshot(page)).state.settings.modelId)
		.toBe("qwen3-local");
	const afterBlur = await snapshot(page);
	expect(
		afterBlur.calls.filter((call) => call.method === "storage.set")
	).toEqual(
		expect.arrayContaining([
			expect.objectContaining({
				input: expect.objectContaining({
					key: "state.v1",
					namespace: "outreach",
					value: expect.stringContaining('"modelId":"qwen3-local"'),
				}),
			}),
		])
	);

	await selectFilter(app, "Ready");
	await expect(campaignOptions(app)).toHaveCount(1);
	await expect(
		campaignOptions(app).filter({ hasText: "Design partners" })
	).toBeVisible();
	await saveProductScreenshot(
		page,
		app,
		"outreach-ready-and-settings-saved.png"
	);
});

test("partial Mail refusal persists accepted recipients and retries only the remaining recipient", async ({
	page,
}) => {
	await page.goto("/");
	let app = appFrame(page);
	await expect(
		app.getByRole("heading", { name: "Design partners · workflow beta" })
	).toBeVisible();
	const initial = (await snapshot(page)).state;
	await clearCalls(page);
	await page.evaluate(() => {
		if (!window.__outreachHostFixture) {
			throw new Error("Missing fixture");
		}
		window.__outreachHostFixture.failNext["mail.send:sam@relay.example"] = 1;
	});
	await app.getByLabel("Sending inbox").selectOption("inbox-partnerships");
	await app
		.getByRole("button", { name: "Clear selection", exact: true })
		.click();
	await app.getByRole("button", { name: "Select ready", exact: true }).click();
	await app.getByRole("button", { name: "Send 2 reviewed" }).click();
	await expect(
		app.getByText(
			"Send stopped after 1 message: Fixture Mail send unavailable."
		)
	).toBeVisible();
	await expect(app.getByRole("checkbox", { name: /Maya Chen/ })).toBeDisabled();
	await expect(app.getByRole("checkbox", { name: /Sam Rivera/ })).toBeEnabled();
	const partial = await snapshot(page);
	const expectedPartial = structuredClone(initial);
	if (!expectedPartial.campaigns[0]) {
		throw new Error("Missing seeded campaign");
	}
	expectedPartial.campaigns[0].recipients =
		expectedPartial.campaigns[0].recipients.map((recipient) =>
			recipient.id === "maya"
				? {
						...recipient,
						status: "sent",
						sendIntent: partial.state.campaigns[0]?.recipients.find(
							(row) => row.id === "maya"
						)?.sendIntent,
					}
				: recipient.id === "sam"
					? {
							...recipient,
							sendIntent: partial.state.campaigns[0]?.recipients.find(
								(row) => row.id === "sam"
							)?.sendIntent,
						}
					: recipient
		);
	expect(partial.state.campaigns[0]?.updatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
	expectedPartial.campaigns[0].updatedAt =
		partial.state.campaigns[0]?.updatedAt ?? "";
	expect(partial.state).toEqual(expectedPartial);
	const sends = partial.calls.filter((call) => call.method === "mail.send");
	for (const [index, id] of ["maya", "sam"].entries()) {
		const row = partial.state.campaigns[0]?.recipients.find(
			(item) => item.id === id
		);
		expect(row?.sendIntent).toMatchObject({
			campaignId: initial.campaigns[0]?.id,
			recipientId: id,
			status: index === 0 ? "accepted" : "uncertain",
			payload: {
				inboxId: "inbox-partnerships",
				subject: initial.campaigns[0]?.subject,
				to: [row?.email],
			},
		});
		expect(row?.sendIntent?.idempotencyKey).toMatch(/^[0-9a-f-]{36}$/);
		expect(sends[index]?.input).toEqual({
			...row?.sendIntent?.payload,
			idempotencyKey: row?.sendIntent?.idempotencyKey,
		});
	}
	expect(
		sends.map((call) => outreachFixtureSendInputSchema.parse(call.input).to)
	).toEqual([["maya@northstar.example"], ["sam@relay.example"]]);
	expect(
		partial.calls
			.map((call) => call.method)
			.filter((method) => ["mail.send", "storage.set"].includes(method))
	).toEqual([
		"storage.set",
		"mail.send",
		"storage.set",
		"storage.set",
		"mail.send",
		"storage.set",
	]);
	const persisted = outreachFixtureStorageInputSchema.parse(
		partial.calls.filter((call) => call.method === "storage.set").at(-1)?.input
	);
	expect(persisted.namespace).toBe("outreach");
	expect(persisted.key).toBe("state.v1");
	expect(JSON.parse(persisted.value)).toEqual(expectedPartial);
	await saveProductScreenshot(
		page,
		app,
		"outreach-partial-send-accepted-preserved.png"
	);
	await page.reload();
	app = appFrame(page);
	await expect(app.getByRole("checkbox", { name: /Maya Chen/ })).toBeDisabled();
	await expect(app.getByRole("checkbox", { name: /Sam Rivera/ })).toBeEnabled();
	await app.getByLabel("Sending inbox").selectOption("inbox-partnerships");
	await clearCalls(page);
	await app
		.getByRole("button", { name: "Clear selection", exact: true })
		.click();
	await app.getByRole("button", { name: "Select ready", exact: true }).click();
	await app.getByRole("button", { name: "Send 1 reviewed" }).click();
	await expect(
		app.getByRole("checkbox", { name: /Sam Rivera/ })
	).toBeDisabled();
	const completed = await snapshot(page);
	expect(completed.calls.filter((call) => call.method === "mail.send")).toEqual(
		[sends[1]]
	);
	const expectedCompleted = structuredClone(expectedPartial);
	if (!expectedCompleted.campaigns[0]) {
		throw new Error("Missing seeded campaign");
	}
	expectedCompleted.campaigns[0].status = "sent";
	expectedCompleted.campaigns[0].recipients =
		expectedCompleted.campaigns[0].recipients.map((recipient) =>
			recipient.id === "sam"
				? {
						...recipient,
						status: "sent",
						sendIntent: completed.state.campaigns[0]?.recipients.find(
							(row) => row.id === "sam"
						)?.sendIntent,
					}
				: recipient
		);
	expectedCompleted.campaigns[0].updatedAt =
		completed.state.campaigns[0]?.updatedAt ?? "";
	expect(completed.state).toEqual(expectedCompleted);
	await page.reload();
	app = appFrame(page);
	await expect(app.getByRole("checkbox", { name: /Maya Chen/ })).toBeDisabled();
	await expect(
		app.getByRole("checkbox", { name: /Sam Rivera/ })
	).toBeDisabled();
	expect((await snapshot(page)).state).toEqual(expectedCompleted);
	await saveProductScreenshot(
		page,
		app,
		"outreach-partial-send-retry-completed-readback.png"
	);
});

test("durable send intent survives ack status-write refusal and reconciles on reload with one transport", async ({
	page,
}) => {
	await page.goto("/");
	let app = appFrame(page);
	await expect(
		app.getByRole("heading", { name: "Design partners · workflow beta" })
	).toBeVisible();
	const original = (await snapshot(page)).state;
	await app
		.getByRole("button", { name: "Clear selection", exact: true })
		.click();
	await app.getByRole("checkbox", { name: /Maya Chen/ }).check();
	await clearCalls(page);
	await page.evaluate(() => {
		window.__outreachHostFixture!.failNext["storage.set:accepted"] = 1;
	});
	await app.getByRole("button", { name: "Send 1 reviewed" }).click();
	await expect(app.getByRole("alert")).toContainText(
		"Mail acknowledged the message, but its status could not be saved"
	);
	const failed = await snapshot(page);
	const intent = failed.state.campaigns[0]!.recipients[0]!.sendIntent!;
	expect(intent.status).toBe("pending");
	expect(failed.state.campaigns[0]!.recipients[0]!.status).toBe("ready");
	expect(
		failed.calls
			.filter((call) => ["storage.set", "mail.send"].includes(call.method))
			.map((call) => call.method)
	).toEqual(["storage.set", "mail.send", "storage.set"]);
	expect(
		failed.calls.find((call) => call.method === "mail.send")?.input
	).toEqual({ ...intent.payload, idempotencyKey: intent.idempotencyKey });
	expect(failed.state.campaigns[1]).toEqual(original.campaigns[1]);
	expect(failed.state.settings).toEqual(original.settings);
	await page.reload();
	app = appFrame(page);
	await expect(
		app.getByText("Needs reconciliation", { exact: true })
	).toBeVisible();
	await clearCalls(page);
	await app.getByLabel("Campaign subject").fill("Changed after uncertain send");
	await app.getByRole("button", { name: "Send 2 reviewed" }).click();
	await expect(app.getByRole("alert")).toContainText("unresolved send");
	expect(
		(await snapshot(page)).calls.filter((call) => call.method === "mail.send")
	).toEqual([]);
	await app.getByLabel("Campaign subject").fill(intent.payload.subject);
	await app
		.getByRole("button", { name: "Clear selection", exact: true })
		.click();
	await app.getByRole("checkbox", { name: /Maya Chen/ }).check();
	await clearCalls(page);
	await app.getByRole("button", { name: "Send 1 reviewed" }).click();
	await expect(app.getByRole("checkbox", { name: /Maya Chen/ })).toBeDisabled();
	const accepted = await snapshot(page);
	expect(
		accepted.calls
			.filter((call) => call.method === "mail.send")
			.map((call) => call.input)
	).toEqual([{ ...intent.payload, idempotencyKey: intent.idempotencyKey }]);
	const transport = await page.evaluate(() =>
		JSON.parse(localStorage.getItem("outreach-mail-transports") ?? "[]")
	);
	expect(transport).toEqual([
		{ ...intent.payload, idempotencyKey: intent.idempotencyKey },
	]);
	const expected = structuredClone(original);
	expected.campaigns[0]!.recipients[0] = {
		...expected.campaigns[0]!.recipients[0]!,
		status: "sent",
		sendIntent: { ...intent, status: "accepted" },
	};
	expected.campaigns[0]!.updatedAt = accepted.state.campaigns[0]!.updatedAt;
	expect(accepted.state).toEqual(expected);
	await page.reload();
	app = appFrame(page);
	await expect(app.getByRole("checkbox", { name: /Maya Chen/ })).toBeDisabled();
	expect((await snapshot(page)).state).toEqual(expected);
	await saveProductScreenshot(
		page,
		app,
		"outreach-durable-intent-reconciled-readback.png"
	);
});

test("refused initial send-intent storage makes zero Mail calls and preserves durable state", async ({
	page,
}) => {
	await page.goto("/");
	const app = appFrame(page);
	await expect(
		app.getByRole("heading", { name: "Design partners · workflow beta" })
	).toBeVisible();
	const before = (await snapshot(page)).state;
	await clearCalls(page);
	await page.evaluate(() => {
		window.__outreachHostFixture!.failNext["storage.set"] = 1;
	});
	await app.getByRole("button", { name: "Send 2 reviewed" }).click();
	await expect(app.getByRole("alert")).toContainText(
		"Fixture Outreach storage write refused"
	);
	const failed = await snapshot(page);
	expect(failed.calls.filter((call) => call.method === "mail.send")).toEqual(
		[]
	);
	expect(failed.state).toEqual(before);
	await page.reload();
	await expect(
		app.getByRole("heading", { name: "Design partners · workflow beta" })
	).toBeVisible();
	expect((await snapshot(page)).state).toEqual(before);
	await saveProductScreenshot(
		page,
		app,
		"outreach-intent-storage-refusal-no-send.png"
	);
});

test("uncertain Mail completion remains unresolved across reload without a new key or transport", async ({
	page,
}) => {
	await page.goto("/");
	let app = appFrame(page);
	await expect(
		app.getByRole("heading", { name: "Design partners · workflow beta" })
	).toBeVisible();
	const before = (await snapshot(page)).state;
	await app
		.getByRole("button", { name: "Clear selection", exact: true })
		.click();
	await app.getByRole("checkbox", { name: /Maya Chen/ }).check();
	await page.evaluate(() => {
		window.__outreachHostFixture!.failNext["mail.complete:uncertain"] = 1;
	});
	await app.getByRole("button", { name: "Send 1 reviewed" }).click();
	await expect(app.getByRole("alert")).toContainText(
		"Mail transport acknowledged the message but its replay record could not be saved"
	);
	const unresolved = (await snapshot(page)).state;
	const intent = unresolved.campaigns[0]!.recipients[0]!.sendIntent!;
	expect(intent.status).toBe("uncertain");
	const expected = structuredClone(before);
	expected.campaigns[0]!.recipients[0]!.sendIntent = intent;
	expect(unresolved).toEqual(expected);
	await page.reload();
	app = appFrame(page);
	await expect(
		app.getByText("Needs reconciliation", { exact: true })
	).toBeVisible();
	await app
		.getByRole("button", { name: "Clear selection", exact: true })
		.click();
	await app.getByRole("checkbox", { name: /Maya Chen/ }).check();
	await clearCalls(page);
	await app.getByRole("button", { name: "Send 1 reviewed" }).click();
	await expect(app.getByRole("alert")).toContainText(
		"mail send outcome is unresolved; reconcile this request before sending again"
	);
	const retry = await snapshot(page);
	expect(retry.state).toEqual(expected);
	expect(
		retry.calls
			.filter((call) => call.method === "mail.send")
			.map((call) => call.input)
	).toEqual([{ ...intent.payload, idempotencyKey: intent.idempotencyKey }]);
	expect(
		await page.evaluate(() =>
			JSON.parse(localStorage.getItem("outreach-mail-transports") ?? "[]")
		)
	).toEqual([{ ...intent.payload, idempotencyKey: intent.idempotencyKey }]);
	await saveProductScreenshot(
		page,
		app,
		"outreach-uncertain-mail-reconciliation-blocked.png"
	);
});
