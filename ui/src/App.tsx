import { Add01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { RyuAppMain, RyuAppToolbar } from "@ryu/blocks/companion/app-ui";
import { useLiteralMessages } from "@ryu/i18n/react";
import { Button } from "@ryu/ui/components/button.tsx";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CampaignListSection } from "./App-campaign-list.tsx";
import {
	activeRecipients,
	EMPTY_FORM,
	errorMessage,
	type Filter,
	matchesFilter,
	modeCopy,
	type NewCampaignForm,
} from "./App-labels.ts";
import { NewCampaignDialog } from "./App-new-campaign-dialog.tsx";
import { OutreachOverview } from "./App-overview.tsx";
import { SendInspector } from "./App-send-inspector.tsx";
import { CampaignWorkbench } from "./App-workbench.tsx";
import {
	type AppMode,
	generateDraft,
	loadMailInboxes,
	loadOutreachState,
	loadRuntimeCatalog,
	notify,
	saveOutreachState,
	sendRecipientEmail,
} from "./bridge.ts";
import {
	campaignStats,
	createCampaign,
	emptyState,
	parseRecipientLines,
	patchCampaign,
	patchRecipients,
	patchSendIntent,
	recipientSendIntent,
} from "./model.ts";
import type { Campaign, Inbox, OutreachState } from "./types.ts";

export function App() {
	const [state, setState] = useState<OutreachState | null>(null);
	const [mode, setMode] = useState<AppMode>(() =>
		window.ryu ? "live" : "demo"
	);
	const [selectedId, setSelectedId] = useState<string | null>(null);
	const [filter, setFilter] = useState<Filter>("all");
	const [selectedRecipientIds, setSelectedRecipientIds] = useState<Set<string>>(
		new Set()
	);
	const [inboxes, setInboxes] = useState<Inbox[]>([]);
	const [inboxError, setInboxError] = useState<string | null>(null);
	const [selectedInboxId, setSelectedInboxId] = useState("");
	const [catalogModel, setCatalogModel] = useState<string | null>(null);
	const [loading, setLoading] = useState(true);
	const [storageReady, setStorageReady] = useState(false);
	const [working, setWorking] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [newOpen, setNewOpen] = useState(false);
	const [newForm, setNewForm] = useState<NewCampaignForm>(EMPTY_FORM);
	const [formError, setFormError] = useState<string | null>(null);
	const tl = useLiteralMessages();

	const campaign = useMemo(
		() =>
			state?.campaigns.find((item) => item.id === selectedId) ??
			state?.campaigns[0] ??
			null,
		[state, selectedId]
	);
	const visibleCampaigns = useMemo(
		() => state?.campaigns.filter((item) => matchesFilter(item, filter)) ?? [],
		[state, filter]
	);
	const stats = useMemo(() => campaignStats(state?.campaigns ?? []), [state]);
	const selectedRecipients = useMemo(
		() => activeRecipients(campaign, selectedRecipientIds),
		[campaign, selectedRecipientIds]
	);
	const selectedReadyCount = selectedRecipients.filter(
		(recipient) => recipient.status === "ready"
	).length;
	const modeDetails = modeCopy(mode);

	const saveQueue = useRef<Promise<void>>(Promise.resolve());
	const persist = useCallback(
		(next: OutreachState) => {
			const write = saveQueue.current
				.catch(() => undefined)
				.then(() => saveOutreachState(next, mode));
			saveQueue.current = write;
			return write;
		},
		[mode]
	);
	const commit = useCallback(
		(next: OutreachState) => {
			if (!storageReady || working) {
				return;
			}
			setState(next);
			void persist(next).catch((cause) => setError(errorMessage(cause)));
		},
		[persist, storageReady, working]
	);

	const load = useCallback(async () => {
		setLoading(true);
		setStorageReady(false);
		setError(null);
		try {
			const [loaded, mail, catalog] = await Promise.all([
				loadOutreachState(),
				loadMailInboxes(),
				loadRuntimeCatalog(),
			]);
			setStorageReady(true);
			setMode(loaded.mode);
			setState(loaded.state);
			setSelectedId(loaded.state.campaigns[0]?.id ?? null);
			setInboxes(mail.inboxes);
			setInboxError(mail.error);
			setSelectedInboxId(mail.inboxes[0]?.id ?? "");
			setCatalogModel(catalog?.current.model ?? null);
		} catch (cause) {
			setError(errorMessage(cause));
			setState(emptyState());
		} finally {
			setLoading(false);
		}
	}, []);

	useEffect(() => {
		void load();
	}, [load]);

	useEffect(() => {
		const ready =
			campaign?.recipients.filter(
				(recipient) => recipient.status === "ready"
			) ?? [];
		setSelectedRecipientIds(
			new Set(ready.slice(0, 2).map((recipient) => recipient.id))
		);
	}, [campaign?.id]);

	function updateCampaign(patch: Partial<Campaign>) {
		if (working || !(state && campaign)) {
			return;
		}
		commit(patchCampaign(state, campaign.id, patch));
	}

	function toggleRecipient(id: string) {
		setSelectedRecipientIds((current) => {
			const next = new Set(current);
			if (next.has(id)) {
				next.delete(id);
			} else {
				next.add(id);
			}
			return next;
		});
	}

	function toggleAllReady() {
		if (!campaign) {
			return;
		}
		const readyIds = campaign.recipients
			.filter((recipient) => recipient.status === "ready")
			.map((recipient) => recipient.id);
		setSelectedRecipientIds((current) =>
			readyIds.every((id) => current.has(id)) ? new Set() : new Set(readyIds)
		);
	}

	async function draftWithRyu() {
		if (!(state && campaign)) {
			return;
		}
		setWorking(true);
		setError(null);
		try {
			const body = await generateDraft(campaign, state.settings.modelId);
			commit(patchCampaign(state, campaign.id, { body, status: "ready" }));
			notify({
				description: "Review the subject, body, and recipients before sending.",
				title: "Draft ready",
				variant: "success",
			});
		} catch (cause) {
			setError(errorMessage(cause));
			notify({
				title: "Draft unavailable",
				description: errorMessage(cause),
				variant: "error",
			});
		} finally {
			setWorking(false);
		}
	}

	async function sendSelected() {
		if (!storageReady || working) {
			return;
		}
		if (!(state && campaign) || selectedReadyCount === 0) {
			setError("Select at least one ready recipient.");
			return;
		}
		if (!(campaign.subject.trim() && campaign.body.trim())) {
			setError("Add a subject and draft body before sending.");
			return;
		}
		if (mode === "live" && !selectedInboxId) {
			setError("Choose an existing Ryu Mail inbox first.");
			return;
		}
		setWorking(true);
		setError(null);
		const sentIds = new Set<string>();
		let acknowledgedState = state;
		try {
			for (const recipient of selectedRecipients.filter(
				(item) => item.status === "ready"
			)) {
				if (mode !== "demo") {
					const intent = recipientSendIntent(
						selectedInboxId,
						campaign,
						recipient
					);
					const pending = patchSendIntent(
						acknowledgedState,
						campaign.id,
						recipient.id,
						intent
					);
					// Persist exact reviewed input before any external handoff.
					await persist(pending);
					acknowledgedState = pending;
					setState(pending);
					try {
						await sendRecipientEmail(intent);
					} catch (cause) {
						const uncertain = patchSendIntent(
							pending,
							campaign.id,
							recipient.id,
							{ ...intent, status: "uncertain" }
						);
						acknowledgedState = uncertain;
						setState(uncertain);
						await persist(uncertain).catch(() => undefined);
						throw cause;
					}
					acknowledgedState = patchSendIntent(
						pending,
						campaign.id,
						recipient.id,
						{ ...intent, status: "accepted" }
					);
				}
				sentIds.add(recipient.id);
				const next = patchRecipients(
					acknowledgedState,
					campaign.id,
					new Set([recipient.id]),
					"sent"
				);
				const refreshed = next.campaigns.find(
					(item) => item.id === campaign.id
				);
				acknowledgedState = patchCampaign(next, campaign.id, {
					status: refreshed?.recipients.every(
						(item) => item.status === "sent" || item.status === "replied"
					)
						? "sent"
						: "ready",
				});
				// Retain each transport acknowledgement before attempting another
				// recipient. A later refusal must not make accepted sends retryable.
				setState(acknowledgedState);
				setSelectedRecipientIds((selected) => {
					const remaining = new Set(selected);
					remaining.delete(recipient.id);
					return remaining;
				});
				try {
					await persist(acknowledgedState);
				} catch (cause) {
					// Keep the ready recipient and durable pending key available for replay.
					const pendingRecipient =
						recipient.sendIntent ??
						acknowledgedState.campaigns
							.find((item) => item.id === campaign.id)
							?.recipients.find((item) => item.id === recipient.id)?.sendIntent;
					if (pendingRecipient) {
						acknowledgedState = patchRecipients(
							patchSendIntent(acknowledgedState, campaign.id, recipient.id, {
								...pendingRecipient,
								status: "uncertain",
							}),
							campaign.id,
							new Set([recipient.id]),
							"ready"
						);
						acknowledgedState = patchCampaign(acknowledgedState, campaign.id, {
							status: "ready",
						});
						setState(acknowledgedState);
						setSelectedRecipientIds(
							(current) => new Set([...current, recipient.id])
						);
					}
					throw new Error(
						`Mail acknowledged the message, but its status could not be saved. Retry the unchanged message to reconcile; do not resend with a new key. ${errorMessage(cause)}`
					);
				}
			}
			setSelectedRecipientIds(new Set());
			notify({
				description:
					mode === "demo"
						? "Preview only — no message left this workspace."
						: tl(
								"Sent {count, plural, one {{size} reviewed message} other {{size} reviewed messages}}.",
								{ count: sentIds.size, size: String(sentIds.size) }
							),
				title: mode === "demo" ? "Preview send recorded" : "Messages sent",
				variant: "success",
			});
		} catch (cause) {
			setError(
				tl(
					"Send stopped after {count, plural, one {{size} message} other {{size} messages}}: {error}",
					{
						count: sentIds.size,
						error: errorMessage(cause),
						size: String(sentIds.size),
					}
				)
			);
		} finally {
			setWorking(false);
		}
	}

	async function copyDraft() {
		if (!campaign?.body) {
			return;
		}
		try {
			await navigator.clipboard.writeText(campaign.body);
			notify({ title: "Draft copied", variant: "default" });
		} catch {
			setError("The draft could not be copied from this host.");
		}
	}

	function createNewCampaign() {
		if (!storageReady || working) {
			return;
		}
		const name = newForm.name.trim();
		const recipientLines = newForm.recipients
			.split(/[\n,]+/)
			.map((line) => line.trim())
			.filter(Boolean);
		const recipients = parseRecipientLines(newForm.recipients);
		if (!name) {
			setFormError("Give the campaign a name.");
			return;
		}
		if (recipients.length === 0) {
			setFormError("Add at least one valid recipient email.");
			return;
		}
		if (recipients.length !== recipientLines.length) {
			setFormError("Check each recipient email address.");
			return;
		}
		const nextCampaign = createCampaign({
			audience: newForm.audience,
			name,
			objective: newForm.objective,
			recipients,
		});
		const next = state
			? { ...state, campaigns: [nextCampaign, ...state.campaigns] }
			: { ...emptyState(), campaigns: [nextCampaign] };
		commit(next);
		setSelectedId(nextCampaign.id);
		setNewOpen(false);
		setNewForm(EMPTY_FORM);
		setFormError(null);
		notify({
			title: "Campaign created",
			description: nextCampaign.name,
			variant: "success",
		});
	}

	if (loading || !state) {
		return (
			<div className="outreach-loading" role="status">
				<span>Opening Outreach…</span>
			</div>
		);
	}

	return (
		<div className="outreach-root">
			<RyuAppToolbar
				actions={
					<Button onClick={() => setNewOpen(true)} size="sm">
						<HugeiconsIcon aria-hidden="true" icon={Add01Icon} />
						New campaign
					</Button>
				}
				title="Outreach"
			/>

			<RyuAppMain className="outreach-main">
				<OutreachOverview
					error={error}
					modeDetails={modeDetails}
					setError={setError}
					stats={stats}
				/>

				<div className="outreach-layout">
					<CampaignListSection
						campaign={campaign}
						filter={filter}
						setFilter={setFilter}
						setSelectedId={setSelectedId}
						visibleCampaigns={visibleCampaigns}
					/>

					<CampaignWorkbench
						campaign={campaign}
						copyDraft={copyDraft}
						draftWithRyu={draftWithRyu}
						selectedReadyCount={selectedReadyCount}
						selectedRecipientIds={selectedRecipientIds}
						setNewOpen={setNewOpen}
						toggleAllReady={toggleAllReady}
						toggleRecipient={toggleRecipient}
						updateCampaign={updateCampaign}
						working={working}
					/>

					<SendInspector
						catalogModel={catalogModel}
						inboxError={inboxError}
						inboxes={inboxes}
						mode={mode}
						selectedInboxId={selectedInboxId}
						selectedReadyCount={selectedReadyCount}
						sendSelected={sendSelected}
						setError={setError}
						setSelectedInboxId={setSelectedInboxId}
						setState={setState}
						state={state}
						working={working}
					/>
				</div>
			</RyuAppMain>

			<NewCampaignDialog
				createNewCampaign={createNewCampaign}
				formError={formError}
				newForm={newForm}
				newOpen={newOpen}
				setFormError={setFormError}
				setNewForm={setNewForm}
				setNewOpen={setNewOpen}
			/>
		</div>
	);
}
