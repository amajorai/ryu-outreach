import {
	Add01Icon,
	CheckmarkCircle02Icon,
	Mail01Icon,
	SparklesIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import {
	RyuAppActions,
	RyuAppDetail,
	RyuAppEmpty,
	RyuAppField,
	RyuAppList,
	RyuAppListItem,
	RyuAppMain,
	RyuAppSection,
	RyuAppToolbar,
} from "@ryu/blocks/companion/app-ui";
import { Badge } from "@ryu/ui/components/badge.tsx";
import { Button } from "@ryu/ui/components/button.tsx";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@ryu/ui/components/dialog.tsx";
import { Input } from "@ryu/ui/components/input.tsx";
import { Label } from "@ryu/ui/components/label.tsx";
import {
	NativeSelect,
	NativeSelectOption,
} from "@ryu/ui/components/native-select.tsx";
import { Textarea } from "@ryu/ui/components/textarea.tsx";
import {
	type FormEvent,
	useCallback,
	useEffect,
	useMemo,
	useState,
} from "react";
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
	campaignProgress,
	campaignStats,
	createCampaign,
	emptyState,
	formatShortDate,
	parseRecipientLines,
	patchCampaign,
	patchRecipients,
} from "./model.ts";
import type { Campaign, Inbox, OutreachState, Recipient } from "./types.ts";

type Filter = "all" | "draft" | "ready" | "sent";

const FILTERS: Array<{ id: Filter; label: string }> = [
	{ id: "all", label: "All" },
	{ id: "draft", label: "Drafts" },
	{ id: "ready", label: "Ready" },
	{ id: "sent", label: "Sent" },
];

interface NewCampaignForm {
	audience: string;
	name: string;
	objective: string;
	recipients: string;
}

const EMPTY_FORM: NewCampaignForm = {
	audience: "",
	name: "",
	objective: "",
	recipients: "",
};

function errorMessage(cause: unknown): string {
	return cause instanceof Error
		? cause.message
		: "Something went wrong. Try again.";
}

function campaignStatusLabel(campaign: Campaign): string {
	if (campaign.status === "sent") {
		return "Sent";
	}
	if (campaign.status === "ready") {
		return "Ready";
	}
	return "Draft";
}

function campaignStatusVariant(
	campaign: Campaign
): "default" | "secondary" | "outline" {
	if (campaign.status === "sent") {
		return "secondary";
	}
	if (campaign.status === "ready") {
		return "default";
	}
	return "outline";
}

function recipientStatusLabel(recipient: Recipient): string {
	if (recipient.status === "replied") {
		return "Replied";
	}
	if (recipient.status === "sent") {
		return "Sent";
	}
	if (recipient.status === "paused") {
		return "Paused";
	}
	return "Ready";
}

function recipientStatusVariant(
	recipient: Recipient
): "default" | "secondary" | "outline" {
	if (recipient.status === "sent" || recipient.status === "replied") {
		return "secondary";
	}
	if (recipient.status === "paused") {
		return "outline";
	}
	return "default";
}

function matchesFilter(campaign: Campaign, filter: Filter): boolean {
	return filter === "all" || campaign.status === filter;
}

function activeRecipients(
	campaign: Campaign | null,
	ids: ReadonlySet<string>
): Recipient[] {
	return (
		campaign?.recipients.filter((recipient) => ids.has(recipient.id)) ?? []
	);
}

function modeCopy(mode: AppMode): { label: string; detail: string } {
	return mode === "demo"
		? { detail: "Sends stay in this preview", label: "Preview" }
		: { detail: "State stays on this Ryu node", label: "Node-owned" };
}

export function App() {
	const [state, setState] = useState<OutreachState | null>(null);
	const [mode, setMode] = useState<AppMode>("demo");
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
	const [working, setWorking] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [newOpen, setNewOpen] = useState(false);
	const [newForm, setNewForm] = useState<NewCampaignForm>(EMPTY_FORM);
	const [formError, setFormError] = useState<string | null>(null);

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

	const commit = useCallback(
		(next: OutreachState) => {
			setState(next);
			void saveOutreachState(next, mode).catch((cause) =>
				setError(errorMessage(cause))
			);
		},
		[mode]
	);

	const load = useCallback(async () => {
		setLoading(true);
		setError(null);
		try {
			const [loaded, mail, catalog] = await Promise.all([
				loadOutreachState(),
				loadMailInboxes(),
				loadRuntimeCatalog(),
			]);
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
		if (!(state && campaign)) {
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
		try {
			for (const recipient of selectedRecipients.filter(
				(item) => item.status === "ready"
			)) {
				if (mode === "demo") {
					sentIds.add(recipient.id);
					continue;
				}
				await sendRecipientEmail(selectedInboxId, campaign, recipient);
				sentIds.add(recipient.id);
			}
			const next = patchRecipients(state, campaign.id, sentIds, "sent");
			const refreshed = next.campaigns.find((item) => item.id === campaign.id);
			const allComplete = refreshed?.recipients.every(
				(recipient) =>
					recipient.status === "sent" || recipient.status === "replied"
			);
			const finalState = patchCampaign(next, campaign.id, {
				status: allComplete ? "sent" : "ready",
			});
			commit(finalState);
			setSelectedRecipientIds(new Set());
			notify({
				description:
					mode === "demo"
						? "Preview only — no message left this workspace."
						: `Sent ${sentIds.size} reviewed message${sentIds.size === 1 ? "" : "s"}.`,
				title: mode === "demo" ? "Preview send recorded" : "Messages sent",
				variant: "success",
			});
		} catch (cause) {
			setError(
				`Send stopped after ${sentIds.size} message${sentIds.size === 1 ? "" : "s"}: ${errorMessage(cause)}`
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

	function createNewCampaign(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
		const name = newForm.name.trim();
		const recipients = parseRecipientLines(newForm.recipients);
		if (!name) {
			setFormError("Give the campaign a name.");
			return;
		}
		if (recipients.length === 0) {
			setFormError("Add at least one recipient email.");
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
				{error ? (
					<div aria-live="polite" className="outreach-alert" role="alert">
						<span>{error}</span>
						<Button
							onClick={() => setError(null)}
							size="xs"
							variant="ghost-muted"
						>
							Dismiss
						</Button>
					</div>
				) : null}

				<div className="outreach-overview">
					<div>
						<h2>Campaigns</h2>
						<p>Plan, review, and send from an existing Ryu Mail inbox.</p>
					</div>
					<div aria-label="Outreach summary" className="outreach-summary">
						<span>
							<strong>{stats.active}</strong> active
						</span>
						<span>
							<strong>{stats.ready}</strong> ready
						</span>
						<span>
							<strong>{stats.sent}</strong> sent
						</span>
						<span className="outreach-mode" title={modeDetails.detail}>
							{modeDetails.label}
						</span>
					</div>
				</div>

				<div className="outreach-layout">
					<RyuAppSection
						className="outreach-panel outreach-campaigns"
						title="Saved campaigns"
					>
						<div
							aria-label="Campaign filters"
							className="outreach-filters"
							role="tablist"
						>
							{FILTERS.map((item) => (
								<Button
									aria-selected={filter === item.id}
									key={item.id}
									onClick={() => setFilter(item.id)}
									role="tab"
									size="xs"
									variant={filter === item.id ? "secondary" : "ghost-muted"}
								>
									{item.label}
								</Button>
							))}
						</div>
						{visibleCampaigns.length > 0 ? (
							<RyuAppList
								aria-label="Saved campaigns"
								className="outreach-campaign-list"
							>
								{visibleCampaigns.map((item) => (
									<RyuAppListItem
										accessories={
											<Badge variant={campaignStatusVariant(item)}>
												{item.status}
											</Badge>
										}
										key={item.id}
										onClick={() => setSelectedId(item.id)}
										selected={campaign?.id === item.id}
										subtitle={`${item.recipients.length} recipients · ${formatShortDate(item.updatedAt)}`}
										title={item.name}
									/>
								))}
							</RyuAppList>
						) : (
							<RyuAppEmpty
								description="Create a campaign when you have a specific audience and a useful reason to reach out."
								title="Nothing in this view"
							/>
						)}
						<p className="outreach-campaign-note">
							Harbor CRM remains the customer record. Outreach owns the sending
							plan.
						</p>
					</RyuAppSection>

					{campaign ? (
						<RyuAppSection className="outreach-panel outreach-workbench">
							<div className="outreach-detail-heading">
								<div>
									<p className="outreach-label">Campaign</p>
									<h2>{campaign.name}</h2>
									<p className="outreach-muted">{campaign.objective}</p>
								</div>
								<Badge variant={campaignStatusVariant(campaign)}>
									{campaignStatusLabel(campaign)}
								</Badge>
							</div>

							<div className="outreach-brief-grid">
								<div>
									<p className="outreach-label">Audience</p>
									<strong>{campaign.audience}</strong>
								</div>
								<div>
									<p className="outreach-label">Offer</p>
									<strong>{campaign.offer}</strong>
								</div>
								<div>
									<p className="outreach-label">Tone</p>
									<strong>{campaign.tone}</strong>
								</div>
								<div>
									<p className="outreach-label">Progress</p>
									<strong>{campaignProgress(campaign)}% considered</strong>
								</div>
							</div>

							<div className="outreach-draft">
								<div className="outreach-section-heading">
									<div>
										<h3>Draft</h3>
										<p className="outreach-muted">
											Review the subject and body before selecting recipients.
										</p>
									</div>
									<div className="outreach-actions">
										<Button
											disabled={working}
											onClick={draftWithRyu}
											size="sm"
											variant="secondary"
										>
											<HugeiconsIcon aria-hidden="true" icon={SparklesIcon} />
											{working ? "Working…" : "Draft with Ryu"}
										</Button>
										<Button
											disabled={!campaign.body}
											onClick={copyDraft}
											size="sm"
											variant="ghost-muted"
										>
											Copy
										</Button>
									</div>
								</div>
								<div className="outreach-fields">
									<RyuAppField label="Subject">
										<Input
											aria-label="Campaign subject"
											autoComplete="off"
											name="campaign-subject"
											onChange={(event) =>
												updateCampaign({ subject: event.target.value })
											}
											value={campaign.subject}
										/>
									</RyuAppField>
									<RyuAppField
										description="Use {{first_name}} to personalize the greeting. Recipient details stay out of the model prompt."
										label="Body"
									>
										<Textarea
											aria-label="Campaign body"
											className="outreach-body"
											name="campaign-body"
											onChange={(event) =>
												updateCampaign({
													body: event.target.value,
													status: event.target.value.trim() ? "ready" : "draft",
												})
											}
											placeholder="Write a note worth replying to…"
											value={campaign.body}
										/>
									</RyuAppField>
								</div>
							</div>

							<div className="outreach-recipients">
								<div className="outreach-section-heading">
									<div>
										<h3>Recipients</h3>
										<p className="outreach-muted">
											{campaign.recipients.length} contacts in this campaign
										</p>
									</div>
									<Button onClick={toggleAllReady} size="xs" variant="outline">
										{selectedReadyCount > 0
											? "Clear selection"
											: "Select ready"}
									</Button>
								</div>
								<div
									aria-label="Campaign recipients"
									className="outreach-recipient-list"
									role="list"
								>
									{campaign.recipients.map((recipient) => (
										<label className="outreach-recipient" key={recipient.id}>
											<input
												checked={selectedRecipientIds.has(recipient.id)}
												disabled={recipient.status !== "ready"}
												onChange={() => toggleRecipient(recipient.id)}
												type="checkbox"
											/>
											<span className="outreach-recipient-copy">
												<strong>{recipient.name}</strong>
												<span>
													{recipient.role} · {recipient.company}
												</span>
											</span>
											<Badge variant={recipientStatusVariant(recipient)}>
												{recipientStatusLabel(recipient)}
											</Badge>
										</label>
									))}
								</div>
							</div>
						</RyuAppSection>
					) : (
						<RyuAppSection className="outreach-panel outreach-workbench">
							<RyuAppEmpty
								actions={
									<Button onClick={() => setNewOpen(true)}>
										<HugeiconsIcon aria-hidden="true" icon={Add01Icon} />
										Create campaign
									</Button>
								}
								description="Start with one audience, one useful offer, and one reason the note should exist."
								title="Your next conversation belongs here"
							/>
						</RyuAppSection>
					)}

					<RyuAppDetail className="outreach-panel outreach-inspector">
						<div className="outreach-inspector-heading">
							<p className="outreach-label">Send</p>
							<h2>Review before sending</h2>
							<p className="outreach-muted">
								Nothing sends until you select a recipient and confirm the
								draft.
							</p>
						</div>
						<div className="outreach-inspector-block">
							<RyuAppField
								description={
									inboxError ?? "One selected recipient per Mail send."
								}
								label="Send from"
							>
								<NativeSelect
									aria-label="Sending inbox"
									disabled={mode === "demo" || inboxes.length === 0}
									onChange={(event) => setSelectedInboxId(event.target.value)}
									value={selectedInboxId}
								>
									{inboxes.length === 0 ? (
										<NativeSelectOption value="">
											No Mail inbox available
										</NativeSelectOption>
									) : null}
									{inboxes.map((inbox) => (
										<NativeSelectOption key={inbox.id} value={inbox.id}>
											{inbox.name} · {inbox.address}
										</NativeSelectOption>
									))}
								</NativeSelect>
							</RyuAppField>
							<p className="outreach-inline-note">
								<HugeiconsIcon aria-hidden="true" icon={Mail01Icon} />
								<span>
									{mode === "demo"
										? "Preview inbox — no delivery"
										: selectedInboxId
											? "Ryu Mail transport selected"
											: "Choose an inbox to enable sending"}
								</span>
							</p>
						</div>
						<div className="outreach-inspector-block">
							<div className="outreach-inspector-label">
								<span>Inference</span>
								<Badge variant="outline">Local-first</Badge>
							</div>
							<p className="outreach-inline-note">
								<HugeiconsIcon aria-hidden="true" icon={SparklesIcon} />
								<span>{catalogModel ?? "Node default"}</span>
							</p>
							<RyuAppField
								description="Optional. Activate Mesh LLM in Engines and enter a model id from its local catalog."
								label="Mesh LLM model id"
							>
								<Input
									aria-label="Mesh LLM model id"
									autoComplete="off"
									name="mesh-llm-model"
									onBlur={() => {
										if (state) {
											void saveOutreachState(state, mode).catch((cause) =>
												setError(errorMessage(cause))
											);
										}
									}}
									onChange={(event) =>
										setState((current) =>
											current
												? {
														...current,
														settings: {
															...current.settings,
															modelId: event.target.value,
														},
													}
												: current
										)
									}
									placeholder="e.g. qwen3-8b…"
									value={state.settings.modelId}
								/>
							</RyuAppField>
						</div>
						<div className="outreach-inspector-block outreach-checks">
							<div className="outreach-inspector-label">
								<span>Before sending</span>
								<span>{selectedReadyCount} selected</span>
							</div>
							<div>
								<HugeiconsIcon
									aria-hidden="true"
									icon={CheckmarkCircle02Icon}
								/>
								<span>Draft is human-reviewed</span>
							</div>
							<div>
								<HugeiconsIcon
									aria-hidden="true"
									icon={CheckmarkCircle02Icon}
								/>
								<span>Recipients are selected</span>
							</div>
							<div>
								<HugeiconsIcon
									aria-hidden="true"
									icon={CheckmarkCircle02Icon}
								/>
								<span>Mail remains the transport</span>
							</div>
						</div>
						<RyuAppActions className="outreach-inspector-actions">
							<Button
								disabled={working || selectedReadyCount === 0}
								onClick={sendSelected}
								size="default"
								variant="default"
							>
								<HugeiconsIcon aria-hidden="true" icon={Mail01Icon} />
								{mode === "demo"
									? `Mark ${selectedReadyCount || "selected"} as sent`
									: `Send ${selectedReadyCount || "selected"} reviewed`}
							</Button>
							<span>
								Sending updates local status only until Mail is selected.
							</span>
						</RyuAppActions>
					</RyuAppDetail>
				</div>
			</RyuAppMain>

			<Dialog
				onOpenChange={(open) => {
					setNewOpen(open);
					if (!open) {
						setFormError(null);
					}
				}}
				open={newOpen}
			>
				<DialogContent className="sm:max-w-lg">
					<DialogHeader>
						<DialogTitle>New campaign</DialogTitle>
						<DialogDescription>
							Start with a specific audience, a useful offer, and one clear
							reason to write.
						</DialogDescription>
					</DialogHeader>
					<form className="outreach-form" onSubmit={createNewCampaign}>
						<div className="outreach-form-fields">
							<div>
								<Label htmlFor="campaign-name">Campaign name</Label>
								<Input
									autoComplete="off"
									id="campaign-name"
									name="campaign-name"
									onChange={(event) =>
										setNewForm((current) => ({
											...current,
											name: event.target.value,
										}))
									}
									placeholder="e.g. Design partners · September…"
									value={newForm.name}
								/>
							</div>
							<div>
								<Label htmlFor="campaign-audience">Audience</Label>
								<Input
									autoComplete="off"
									id="campaign-audience"
									name="campaign-audience"
									onChange={(event) =>
										setNewForm((current) => ({
											...current,
											audience: event.target.value,
										}))
									}
									placeholder="Who is this for?…"
									value={newForm.audience}
								/>
							</div>
							<div className="outreach-form-wide">
								<Label htmlFor="campaign-objective">Objective</Label>
								<Textarea
									autoComplete="off"
									id="campaign-objective"
									name="campaign-objective"
									onChange={(event) =>
										setNewForm((current) => ({
											...current,
											objective: event.target.value,
										}))
									}
									placeholder="What useful conversation are you trying to start?…"
									value={newForm.objective}
								/>
							</div>
							<div className="outreach-form-wide">
								<Label htmlFor="campaign-recipients">Recipients</Label>
								<Textarea
									autoComplete="off"
									id="campaign-recipients"
									name="campaign-recipients"
									onChange={(event) =>
										setNewForm((current) => ({
											...current,
											recipients: event.target.value,
										}))
									}
									placeholder="Maya Chen <maya@example.com>…"
									value={newForm.recipients}
								/>
							</div>
						</div>
						{formError ? (
							<p
								aria-live="polite"
								className="outreach-form-error"
								role="alert"
							>
								{formError}
							</p>
						) : null}
						<DialogFooter>
							<span className="outreach-form-note">
								Recipients stay in Outreach until you choose Send.
							</span>
							<Button type="submit">Create campaign</Button>
						</DialogFooter>
					</form>
				</DialogContent>
			</Dialog>
		</div>
	);
}
