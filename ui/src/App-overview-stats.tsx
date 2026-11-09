import { useRichLiteralMessages } from "@ryu/i18n/react";
import type { ReactNode } from "react";

const bold = { b: (chunks: ReactNode) => <strong>{chunks}</strong> };

/**
 * The Outreach header counters: active campaigns, ready and sent recipients. Each counter is one whole message with the number
 * inside it, so a language can inflect the noun for the count ("1 человек",
 * "3 человека") and place the number where its grammar wants.
 */
export function OutreachSummaryCounts({
	active,
	ready,
	sent,
}: {
	active: number;
	ready: number;
	sent: number;
}) {
	const tlRich = useRichLiteralMessages();
	return (
		<>
			<span>
				{tlRich(
					"{count, plural, one {<b>#</b> active} other {<b>#</b> active}}",
					{ count: active },
					bold
				)}
			</span>
			<span>
				{tlRich(
					"{count, plural, one {<b>#</b> ready} other {<b>#</b> ready}}",
					{ count: ready },
					bold
				)}
			</span>
			<span>
				{tlRich(
					"{count, plural, one {<b>#</b> sent} other {<b>#</b> sent}}",
					{ count: sent },
					bold
				)}
			</span>
		</>
	);
}
