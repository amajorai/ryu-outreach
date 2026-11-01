import {
	RyuAppEmpty,
	RyuAppList,
	RyuAppListItem,
	RyuAppSection,
} from "@ryu/blocks/companion/app-ui";
import { useLiteralMessages } from "@ryu/i18n/react";
import { Badge } from "@ryu/ui/components/badge.tsx";
import { Tabs, TabsList, TabsTrigger } from "@ryu/ui/components/tabs.tsx";
import { campaignStatusVariant, FILTERS, type Filter } from "./App-labels.ts";
import { formatShortDate } from "./model.ts";
import type { Campaign } from "./types.ts";

interface CampaignListSectionProps {
	campaign: Campaign | null;
	filter: Filter;
	setFilter: (filter: Filter) => void;
	setSelectedId: (id: string) => void;
	visibleCampaigns: Campaign[];
}

export function CampaignListSection({
	campaign,
	filter,
	setFilter,
	setSelectedId,
	visibleCampaigns,
}: CampaignListSectionProps) {
	const tl = useLiteralMessages();
	return (
		<RyuAppSection
			className="outreach-panel outreach-campaigns"
			title="Saved campaigns"
		>
			<Tabs
				onValueChange={(value) => {
					const item = FILTERS.find((item) => item.id === value);
					if (item) {
						setFilter(item.id);
					}
				}}
				value={filter}
			>
				<TabsList aria-label="Campaign filters" variant="line">
					{FILTERS.map((item) => (
						<TabsTrigger key={item.id} value={item.id}>
							{item.label}
						</TabsTrigger>
					))}
				</TabsList>
			</Tabs>
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
							subtitle={tl("{count} recipients · {date}", {
								count: String(item.recipients.length),
								date: formatShortDate(item.updatedAt),
							})}
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
				Harbor CRM remains the customer record. Outreach owns the sending plan.
			</p>
		</RyuAppSection>
	);
}
