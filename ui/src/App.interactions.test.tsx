import { afterEach, describe, expect, test } from "bun:test";
import { GlobalRegistrator } from "@happy-dom/global-registrator";
import type { Root } from "react-dom/client";
import { emptyState } from "./model.ts";

if (!GlobalRegistrator.isRegistered) {
	GlobalRegistrator.register();
}
Reflect.set(globalThis, "IS_REACT_ACT_ENVIRONMENT", true);
const { act } = await import("react");
const { createRoot } = await import("react-dom/client");
const { App } = await import("./App.tsx");

const STORAGE_KEY = "ryu.outreach.state.v1";

interface MountedApp {
	container: HTMLDivElement;
	root: Root;
}

const mountedApps: MountedApp[] = [];

async function tick(): Promise<void> {
	await new Promise((resolve) => setTimeout(resolve, 0));
}

async function mountApp(): Promise<HTMLDivElement> {
	const container = document.createElement("div");
	document.body.append(container);
	const root = createRoot(container);
	mountedApps.push({ container, root });
	await act(async () => {
		root.render(<App />);
		await tick();
		await tick();
	});
	return container;
}

function findButton(container: HTMLElement, text: string): HTMLButtonElement {
	const button = [...container.querySelectorAll("button")].find((candidate) =>
		candidate.textContent?.includes(text)
	);
	if (!(button instanceof HTMLButtonElement)) {
		const available = [...container.querySelectorAll("button")]
			.map((candidate) => candidate.textContent?.trim())
			.filter(Boolean)
			.join(" | ");
		throw new Error(
			`Could not find button containing ${text}. Found: ${available}`
		);
	}
	return button;
}

async function clickButton(
	container: HTMLElement,
	text: string
): Promise<void> {
	await act(async () => {
		findButton(container, text).click();
		await tick();
		await tick();
	});
}

async function fillField(
	container: HTMLElement,
	selector: string,
	value: string
): Promise<void> {
	const field = container.querySelector<HTMLInputElement | HTMLTextAreaElement>(
		selector
	);
	if (!field) {
		throw new Error(`Could not find field: ${selector}`);
	}
	await act(async () => {
		const setter = Object.getOwnPropertyDescriptor(
			Object.getPrototypeOf(field),
			"value"
		)?.set;
		setter?.call(field, value);
		field.dispatchEvent(new Event("input", { bubbles: true }));
		await tick();
	});
}

afterEach(async () => {
	for (const { container, root } of mountedApps.splice(0)) {
		await act(async () => root.unmount());
		container.remove();
	}
	Reflect.set(window, "ryu", undefined);
	localStorage.clear();
});

describe("Outreach rendered campaign workflow", () => {
	test("creates and preview-sends reviewed recipients into local history without a Mail bridge", async () => {
		localStorage.setItem(STORAGE_KEY, JSON.stringify(emptyState()));
		const container = await mountApp();
		expect(container.textContent).toContain("Preview");
		expect(container.textContent).toContain("Preview inbox — no delivery");

		await clickButton(container, "New campaign");
		await fillField(
			document.body,
			"#campaign-name",
			"Field research · September"
		);
		await fillField(document.body, "#campaign-audience", "Small product teams");
		await fillField(
			document.body,
			"#campaign-objective",
			"Invite two teams to a feedback session"
		);
		await fillField(
			document.body,
			"#campaign-recipients",
			"Maya Chen <maya@example.com>\nAri Patel <ari@example.com>"
		);
		await act(async () => {
			const form =
				document.body.querySelector<HTMLFormElement>("form.outreach-form");
			if (!form) {
				throw new Error("Could not find the campaign form submit control.");
			}
			form.requestSubmit();
			await tick();
			await tick();
		});

		expect(container.textContent).toContain("Field research · September");
		expect(container.textContent).toContain("2 contacts in this campaign");
		expect(container.textContent).toContain("Maya Chen");
		expect(container.textContent).toContain("Ari Patel");

		await fillField(
			container,
			'input[aria-label="Campaign subject"]',
			"Could we learn from your workflow?"
		);
		await fillField(
			container,
			'textarea[aria-label="Campaign body"]',
			"Hi {{first_name}}, would a short feedback session be useful?"
		);
		await clickButton(container, "Clear selection");
		expect(container.textContent).toContain("0 selected");
		await clickButton(container, "Select ready");
		expect(container.textContent).toContain("Before sending2 selected");
		await clickButton(container, "Mark 2 as sent");
		expect(container.textContent).toContain("2 sent");

		const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}");
		expect(saved.campaigns[0]).toMatchObject({
			audience: "Small product teams",
			body: "Hi {{first_name}}, would a short feedback session be useful?",
			name: "Field research · September",
			objective: "Invite two teams to a feedback session",
			recipients: [
				{ email: "maya@example.com", name: "Maya Chen", status: "sent" },
				{ email: "ari@example.com", name: "Ari Patel", status: "sent" },
			],
			subject: "Could we learn from your workflow?",
		});
		expect(window.ryu).toBeUndefined();
	});
});
