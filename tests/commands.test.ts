import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { nightlyHint, parseHistoryArgs } from "../extensions/computer-history/commands.ts";

describe("/history command parsing", () => {
	it("defaults to status", () => {
		assert.deepEqual(parseHistoryArgs(""), { command: "status", rest: [] });
		assert.deepEqual(parseHistoryArgs("   "), { command: "status", rest: [] });
	});

	it("accepts lifecycle subcommands and list/show args", () => {
		assert.deepEqual(parseHistoryArgs("list 20"), { command: "list", rest: ["20"] });
		assert.deepEqual(parseHistoryArgs("show 42"), { command: "show", rest: ["42"] });
		assert.deepEqual(parseHistoryArgs("enable"), { command: "enable", rest: [] });
		assert.deepEqual(parseHistoryArgs("delete"), { command: "delete", rest: [] });
	});

	it("rejects unknown subcommands", () => {
		const parsed = parseHistoryArgs("export");
		assert.ok("error" in parsed);
		assert.match(parsed.error, /Usage: \/history/);
	});

	it("tells the user how to switch to nightly when history is missing", () => {
		const hint = nightlyHint();
		assert.match(hint, /channel set nightly/);
		assert.match(hint, /history enable/);
		assert.match(hint, /cannot enable, pause, delete/);
	});
});
