import {
	CheckmarkCircle02Icon,
	Mail01Icon,
	SparklesIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import {
	RyuAppActions,
	RyuAppDetail,
	RyuAppField,
} from "@ryu/blocks/companion/app-ui";
import { useLiteralMessages } from "@ryu/i18n/react";
import { Badge } from "@ryu/ui/components/badge.tsx";
import { Button } from "@ryu/ui/components/button.tsx";
import { Input } from "@ryu/ui/components/input.tsx";
import {
	NativeSelect,
	NativeSelectOption,
} from "@ryu/ui/components/native-select.tsx";
import type { Dispatch, SetStateAction } from "react";
import { errorMessage } from "./App-labels.ts";
import { type AppMode, saveOutreachState } from "./bridge.ts";
import type { Inbox, OutreachState } from "./types.ts";

interface SendInspectorProps {
	catalogModel: string | null;
	inboxError: string | null;
	inboxes: Inbox[];
	mode: AppMode;
	selectedInboxId: string;
	selectedReadyCount: number;
	sendSelected: () => void;
	setError: (error: string | null) => void;
	setSelectedInboxId: (id: string) => void;
	setState: Dispatch<SetStateAction<OutreachState | null>>;
	state: OutreachState;
	working: boolean;
}

export function SendInspector({
	catalogModel,
	inboxError,
	inboxes,
	mode,
	selectedInboxId,
	selectedReadyCount,
	sendSelected,
	setError,
	setSelectedInboxId,
	setState,
	state,
	working,
}: SendInspectorProps) {
	const tl = useLiteralMessages();
	return (
		<RyuAppDetail className="outreach-panel outreach-inspector">
			<div className="outreach-inspector-heading">
				<p className="outreach-label">Send</p>
				<h2>Review before sending</h2>
				<p className="outreach-muted">
					Nothing sends until you select a recipient and confirm the draft.
				</p>
			</div>
			<div className="outreach-inspector-block">
				<RyuAppField
					description={inboxError ?? "One selected recipient per Mail send."}
					label="Send from"
				>
					<NativeSelect
						aria-label="Sending inbox"
						disabled={working || mode === "demo" || inboxes.length === 0}
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
					<span>
						{tl("{count} selected", { count: String(selectedReadyCount) })}
					</span>
				</div>
				<div>
					<HugeiconsIcon aria-hidden="true" icon={CheckmarkCircle02Icon} />
					<span>Draft is human-reviewed</span>
				</div>
				<div>
					<HugeiconsIcon aria-hidden="true" icon={CheckmarkCircle02Icon} />
					<span>Recipients are selected</span>
				</div>
				<div>
					<HugeiconsIcon aria-hidden="true" icon={CheckmarkCircle02Icon} />
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
						? selectedReadyCount
							? tl("Mark {count} as sent", {
									count: String(selectedReadyCount),
								})
							: tl("Mark selected as sent")
						: selectedReadyCount
							? tl("Send {count} reviewed", {
									count: String(selectedReadyCount),
								})
							: tl("Send selected reviewed")}
				</Button>
				<span>Sending updates local status only until Mail is selected.</span>
			</RyuAppActions>
		</RyuAppDetail>
	);
}
