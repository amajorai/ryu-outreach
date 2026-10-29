import path from "node:path";
import { defineConfig, devices } from "@playwright/test";

const e2eDirectory = import.meta.dirname;
const appRoot = path.resolve(e2eDirectory, "..");
const baseURL = "http://127.0.0.1:4576";

export default defineConfig({
	testDir: e2eDirectory,
	testMatch: "outreach-companion.spec.ts",
	fullyParallel: false,
	workers: 1,
	reporter: "list",
	outputDir: "/tmp/ryu-outreach-playwright-results",
	use: {
		...devices["Desktop Chrome"],
		baseURL,
		viewport: { width: 1480, height: 1020 },
	},
	webServer: {
		command:
			"bun run build && bun run vite --config=e2e/vite.config.ts --host 127.0.0.1 --port 4576 --strictPort",
		cwd: appRoot,
		url: baseURL,
		reuseExistingServer: false,
		timeout: 120_000,
	},
});
