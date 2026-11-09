import type { HostServices } from "@ryu/app-host/rpc";
import type { OutreachState } from "../src/types.ts";

type RecordedService = NonNullable<
	| HostServices["mailSend"]
	| HostServices["modelComplete"]
	| HostServices["storageGet"]
	| HostServices["storageSet"]
	| HostServices["uiToastShow"]
>;
export type OutreachFixtureInput = Parameters<RecordedService>[0];

export interface OutreachFixtureCall {
	input?: OutreachFixtureInput;
	method: string;
}

export interface OutreachFixtureSnapshot {
	calls: OutreachFixtureCall[];
	state: OutreachState;
}

export interface OutreachHostFixture {
	calls: OutreachFixtureCall[];
	failNext: Record<string, number>;
	getSnapshot(): OutreachFixtureSnapshot;
}

declare global {
	interface Window {
		__outreachHostFixture?: OutreachHostFixture;
	}
}
