/// <reference types="vite/client" />

import { ExtensionHost } from "@ryu/app-host/ExtensionHost";
import { capabilitiesFromGrants, type HostServices } from "@ryu/app-host/rpc";
import { htmlCompanionSrcdoc } from "@ryu/app-host/third-party-plugin";
import { useMemo } from "react";
import { createRoot } from "react-dom/client";
import manifest from "../../manifest.json" with { type: "json" };
import appHtml from "../dist/index.html?raw";
import { demoState, emptyState, normalizeState } from "../src/model.ts";
import type { OutreachState } from "../src/types.ts";
import {
	outreachFixtureReplaySchema,
	outreachFixtureTransportSchema,
} from "./fixture-schemas.ts";
import type {
	OutreachFixtureCall,
	OutreachFixtureInput,
	OutreachFixtureSnapshot,
	OutreachHostFixture,
} from "./fixture-types.ts";
import styles from "./host-proof.module.css";
import "./host.css";

const STORAGE_NAMESPACE = "outreach";
const STORAGE_KEY = "state.v1";
const FIXTURE_STORAGE_KEY = "ryu-outreach-extension-host-fixture-v1";

function readState(): OutreachState {
	const stored = window.localStorage.getItem(FIXTURE_STORAGE_KEY);
	if (stored) {
		try {
			return normalizeState(JSON.parse(stored));
		} catch {
			return emptyState();
		}
	}
	return new URLSearchParams(location.search).has("empty")
		? emptyState()
		: demoState();
}

const fixture: OutreachHostFixture = {
	calls: [],
	failNext: {
		"model.complete": Number(
			new URLSearchParams(location.search).get("modelFailures") ?? 0
		),
	},
	getSnapshot(): OutreachFixtureSnapshot {
		return {
			calls: structuredClone(fixture.calls),
			state: readState(),
		};
	},
};
window.__outreachHostFixture = fixture;

function record(method: string, input?: OutreachFixtureInput): void {
	const call: OutreachFixtureCall = {
		method,
	};
	if (input !== undefined) {
		call.input = structuredClone(input);
	}
	fixture.calls.push(call);
}

function shouldFail(method: string): boolean {
	const remaining = fixture.failNext[method] ?? 0;
	if (remaining <= 0) {
		return false;
	}
	fixture.failNext[method] = remaining - 1;
	return true;
}

const services = {
	listAgents: async () => [],
	catalogSnapshot: async () => {
		record("catalog.snapshot");
		return {
			agents: [],
			apiTypes: [],
			current: {
				model: "fixture-catalog-model",
				provider: "local",
				providerRouting: {},
				routing: "auto",
			},
			hookEvents: [],
			hooks: [],
			plugins: [],
			providers: [],
			thinkingLevels: [],
			version: 1,
		};
	},
	mailList: async () => {
		record("mail.list");
		return [
			{
				address: "research@ryu.example",
				id: "inbox-research",
				name: "Research",
			},
			{
				address: "partnerships@ryu.example",
				id: "inbox-partnerships",
				name: "Partnerships",
			},
		];
	},
	mailSend: async (input) => {
		record("mail.send", input);
		const recipient = input.to[0];
		if (shouldFail(`mail.send:${recipient}`) || shouldFail("mail.send")) {
			throw new Error("Fixture Mail send unavailable.");
		}
		const keyed = input;
		if (keyed.idempotencyKey) {
			const storeKey = `outreach-mail-intent:${keyed.idempotencyKey}`;
			const fingerprint = JSON.stringify(input);
			const previous = window.localStorage.getItem(storeKey);
			if (previous) {
				const saved = outreachFixtureReplaySchema.parse(JSON.parse(previous));
				if (saved.fingerprint !== fingerprint) {
					throw new Error("Idempotency input conflict.");
				}
				if (!saved.response) {
					throw new Error(
						"mail send outcome is unresolved; reconcile this request before sending again"
					);
				}
				return saved.response;
			}
			const response = { id: `mail-message-${fixture.calls.length}` };
			window.localStorage.setItem(
				storeKey,
				JSON.stringify({ fingerprint, response })
			);
			const transports = outreachFixtureTransportSchema.parse(
				JSON.parse(
					window.localStorage.getItem("outreach-mail-transports") ?? "[]"
				)
			);
			window.localStorage.setItem(
				"outreach-mail-transports",
				JSON.stringify([...transports, input])
			);
			if (shouldFail("mail.complete:uncertain")) {
				window.localStorage.setItem(storeKey, JSON.stringify({ fingerprint }));
				throw new Error(
					"Mail transport acknowledged the message but its replay record could not be saved; reconcile this request before retrying"
				);
			}
			return response;
		}
		return { id: `mail-message-${fixture.calls.length}` };
	},
	modelComplete: async (input) => {
		record("model.complete", input);
		if (shouldFail("model.complete")) {
			throw new Error("Fixture model temporarily unavailable.");
		}
		return "Hi {{first_name}},\n\nWould a short research conversation be useful?";
	},
	storageGet: async (input: { namespace?: string; key: string }) => {
		record("storage.get", input);
		if (input.namespace !== STORAGE_NAMESPACE || input.key !== STORAGE_KEY) {
			return null;
		}
		const stored = window.localStorage.getItem(FIXTURE_STORAGE_KEY);
		return stored ?? JSON.stringify(readState());
	},
	storageSet: async (input: {
		namespace?: string;
		key: string;
		value: string;
	}) => {
		record("storage.set", input);
		if (input.namespace !== STORAGE_NAMESPACE || input.key !== STORAGE_KEY) {
			throw new Error("Unexpected Outreach storage key.");
		}
		const next = normalizeState(JSON.parse(input.value));
		const hasAccepted = next.campaigns.some((item) =>
			item.recipients.some((row) => row.sendIntent?.status === "accepted")
		);
		if (
			shouldFail("storage.set") ||
			(hasAccepted && shouldFail("storage.set:accepted"))
		) {
			throw new Error("Fixture Outreach storage write refused.");
		}
		window.localStorage.setItem(FIXTURE_STORAGE_KEY, input.value);
	},
	uiToastShow: async (input) => {
		record("ui.toast.show", input);
		return `outreach-toast-${fixture.calls.length}`;
	},
	registerRoute: () =>
		Promise.reject(new Error("ui.registerRoute is not available")),
} satisfies HostServices;

function ProductHost() {
	const nonce = useMemo(() => crypto.randomUUID(), []);
	const srcdoc = useMemo(
		() => htmlCompanionSrcdoc(nonce, appHtml, manifest.id),
		[nonce]
	);
	const granted = useMemo(
		() => capabilitiesFromGrants(manifest.permission_grants),
		[]
	);
	return (
		<main className={styles.proof}>
			<p>
				Built Outreach bundle · sandboxed ExtensionHost · deterministic local
				Mail, model, and storage fixtures
			</p>
			<ExtensionHost
				granted={granted}
				nonce={nonce}
				services={services}
				srcdoc={srcdoc}
				title="Outreach"
			/>
		</main>
	);
}

const root = document.getElementById("root");
if (root) {
	createRoot(root).render(<ProductHost />);
}
