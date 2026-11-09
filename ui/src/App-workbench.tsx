import { Add01Icon, SparklesIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import {
	RyuAppEmpty,
	RyuAppField,
	RyuAppSection,
} from "@ryu/blocks/companion/app-ui";
import { useLiteralMessages } from "@ryu/i18n/react";
import { Badge } from "@ryu/ui/components/badge.tsx";
import { Button } from "@ryu/ui/components/button.tsx";
import { Checkbox } from "@ryu/ui/components/checkbox.tsx";
import { Input } from "@ryu/ui/components/input.tsx";
import { Textarea } from "@ryu/ui/components/textarea.tsx";
import {
	campaignStatusLabel,
	campaignStatusVariant,
	recipientStatusLabel,
	recipientStatusVariant,
} from "./App-labels.ts";
import { campaignProgress } from "./model.ts";
import type { Campaign } from "./types.ts";

interface CampaignWorkbenchProps {
	campaign: Campaign | null;
	copyDraft: () => void;
	draftWithRyu: () => void;
	selectedReadyCount: number;
	selectedRecipientIds: ReadonlySet<string>;
	setNewOpen: (open: boolean) => void;
	toggleAllReady: () => void;
	toggleRecipient: (id: string) => void;
	updateCampaign: (patch: Partial<Campaign>) => void;
	working: boolean;
}

export function CampaignWorkbench({
	campaign,
	copyDraft,
	draftWithRyu,
	selectedReadyCount,
	selectedRecipientIds,
	setNewOpen,
	toggleAllReady,
	toggleRecipient,
	updateCampaign,
	working,
}: CampaignWorkbenchProps) {
	const tl = useLiteralMessages();
	return campaign ? (
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
					<strong>
						{tl("{percent}% considered", {
							percent: String(campaignProgress(campaign)),
						})}
					</strong>
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
							disabled={working}
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
							disabled={working}
							name="campaign-body"
							onChange={(event) =>
								updateCampaign({
									body: event.target.value,
									status: event.target.value.trim() ? "ready" : "draft",
								})
							}
							placeholder="Write a note worth replying to…"
							rows={6}
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
							{tl("{count} contacts in this campaign", {
								count: String(campaign.recipients.length),
							})}
						</p>
					</div>
					<Button onClick={toggleAllReady} size="xs" variant="outline">
						{selectedReadyCount > 0 ? "Clear selection" : "Select ready"}
					</Button>
				</div>
				<div
					aria-label="Campaign recipients"
					className="outreach-recipient-list"
					role="list"
				>
					{campaign.recipients.map((recipient) => (
						<label className="outreach-recipient" key={recipient.id}>
							<Checkbox
								checked={selectedRecipientIds.has(recipient.id)}
								disabled={recipient.status !== "ready"}
								onCheckedChange={() => toggleRecipient(recipient.id)}
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
	);
}
