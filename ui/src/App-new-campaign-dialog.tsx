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
import { Textarea } from "@ryu/ui/components/textarea.tsx";
import type { Dispatch, SetStateAction } from "react";
import type { NewCampaignForm } from "./App-labels.ts";

interface NewCampaignDialogProps {
	createNewCampaign: () => void;
	formError: string | null;
	newForm: NewCampaignForm;
	newOpen: boolean;
	setFormError: (error: string | null) => void;
	setNewForm: Dispatch<SetStateAction<NewCampaignForm>>;
	setNewOpen: (open: boolean) => void;
}

export function NewCampaignDialog({
	createNewCampaign,
	formError,
	newForm,
	newOpen,
	setFormError,
	setNewForm,
	setNewOpen,
}: NewCampaignDialogProps) {
	return (
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
						Start with a specific audience, a useful offer, and one clear reason
						to write.
					</DialogDescription>
				</DialogHeader>
				<form
					className="outreach-form"
					onKeyDown={(event) => {
						if (
							event.key === "Enter" &&
							event.target instanceof HTMLInputElement
						) {
							event.preventDefault();
							createNewCampaign();
						}
					}}
					onSubmit={(event) => {
						event.preventDefault();
						createNewCampaign();
					}}
				>
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
						<p aria-live="polite" className="outreach-form-error" role="alert">
							{formError}
						</p>
					) : null}
					<DialogFooter>
						<span className="outreach-form-note">
							Recipients stay in Outreach until you choose Send.
						</span>
						<Button
							onClick={(event) => {
								event.preventDefault();
								createNewCampaign();
							}}
							type="submit"
						>
							Create campaign
						</Button>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	);
}
