import { Button } from "@ryu/ui/components/button.tsx";
import type { campaignStats } from "./model.ts";

interface OutreachOverviewProps {
	error: string | null;
	modeDetails: { label: string; detail: string };
	setError: (error: string | null) => void;
	stats: ReturnType<typeof campaignStats>;
}

export function OutreachOverview({
	error,
	modeDetails,
	setError,
	stats,
}: OutreachOverviewProps) {
	return (
		<>
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
		</>
	);
}
