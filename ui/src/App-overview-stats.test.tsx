import { afterEach, describe, expect, test } from "bun:test";
import { registerLiteralCatalogLoader } from "@ryu/i18n/core";
import { I18nProvider } from "@ryu/i18n/react";
import { renderToStaticMarkup } from "react-dom/server";
import { OutreachSummaryCounts } from "./App-overview-stats.tsx";

const COUNTER = "{count, plural, one {<b>#</b> ready} other {<b>#</b> ready}}";

function render(locale: string, count: number): string {
	return renderToStaticMarkup(
		<I18nProvider
			autoLocalizeDom={false}
			initialLocale={locale}
			initialPackId={null}
		>
			<OutreachSummaryCounts active={count} ready={count} sent={count} />
		</I18nProvider>
	);
}

afterEach(() => registerLiteralCatalogLoader(null));

describe("OutreachSummaryCounts", () => {
	test("keeps each number inside its counter in English", () => {
		const html = render("en", 2);
		expect(html).toContain("<strong>2</strong> active");
		expect(html).toContain("<strong>2</strong> ready");
		expect(html).toContain("<strong>2</strong> sent");
	});

	test("lets Russian pick the plural form for the count", () => {
		registerLiteralCatalogLoader(() => ({
			[COUNTER]:
				"{count, plural, one {<b>#</b> готов} few {<b>#</b> готовы} other {<b>#</b> готово}}",
		}));
		expect(render("ru", 3)).toContain("<strong>3</strong> готовы");
		expect(render("ru", 5)).toContain("<strong>5</strong> готово");
	});
});
