import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
	namedAssertionIsPresent,
	reconcileLocalInteractionMap,
} from "../../../../apps-store/companion-suite.mjs";

const e2eDirectory = import.meta.dirname;
const packageRoot = path.resolve(e2eDirectory, "..");
const repositoryRoot = path.resolve(e2eDirectory, "../../../..");
const inventoryPath = path.join(
	repositoryRoot,
	"docs/proof/test-coverage-sweep-20260924/companion-interaction-inventory.tsv"
);
const mapPath = path.join(e2eDirectory, "companion-interactions.json");
const specPath = path.join(e2eDirectory, "outreach-companion.spec.ts");

function parseTsv(source) {
	const [headerLine, ...lines] = source.trimEnd().split(/\r?\n/);
	const headers = headerLine?.split("\t") ?? [];
	return lines.map((line) => {
		const values = line.split("\t");
		return Object.fromEntries(
			headers.map((header, index) => [header, values[index] ?? ""])
		);
	});
}

const censusRows = parseTsv(readFileSync(inventoryPath, "utf8"));
const outreachRows = censusRows.filter((row) => row.package === "outreach");
const map = JSON.parse(readFileSync(mapPath, "utf8"));
const specSource = readFileSync(specPath, "utf8");

describe("Outreach package-owned interaction map", () => {
	test("joins all fourteen mapped controls to real ExtensionHost browser assertions", () => {
		const reconciled = reconcileLocalInteractionMap(
			"outreach",
			censusRows,
			map
		);
		const missing = reconciled.filter(
			({ assertion }) =>
				!namedAssertionIsPresent(
					specSource,
					assertion.testTitle,
					assertion.assertionMarker
				)
		);

		expect(outreachRows).toHaveLength(22);
		expect(map.expectedRows).toBe(14);
		expect(reconciled).toHaveLength(14);
		expect(new Set(reconciled.map(({ row }) => JSON.stringify(row))).size).toBe(
			14
		);
		expect(missing).toEqual([]);
	});

	test("rejects stale and duplicate control identities", () => {
		const first = map.assertions[0];
		expect(first).toBeDefined();
		expect(() =>
			reconcileLocalInteractionMap("outreach", censusRows, {
				...map,
				assertions: [first, { ...first }],
				expectedRows: 2,
			})
		).toThrow("duplicates an interaction identity");

		const stale = { ...first, row: { ...first.row, line: "99999" } };
		expect(() =>
			reconcileLocalInteractionMap("outreach", censusRows, {
				...map,
				assertions: [stale],
				expectedRows: 1,
			})
		).toThrow("does not match exactly one current central census row");
	});

	test("keeps the map attached to the UI package", () => {
		const manifest = JSON.parse(
			readFileSync(path.join(packageRoot, "package.json"), "utf8")
		);
		expect(manifest.ryuCompanionInteractionMap).toBe(
			"e2e/companion-interactions.json"
		);
	});
});
