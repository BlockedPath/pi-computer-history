import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
	ACTION_TOOLS,
	advertisedWrappedTools,
	HISTORY_TOOLS,
	invalidHistoryQueryRange,
	isBinaryMissing,
	looksLikeUnknownHistoryCommand,
	parseListTools,
} from "../extensions/computer-history/cua.ts";

const LIST_TOOLS = `
bring_to_front: Persistently activate an app
click: Click against a target pid
get_window_state: Walk a running app's AX tree
list_apps: List macOS apps
list_windows: List all layer-0 top-level windows
type_text: Insert text into the target pid
`.trim();

describe("cua discovery helpers", () => {
	it("parses cua-driver list-tools lines", () => {
		const tools = parseListTools(LIST_TOOLS);
		for (const name of ACTION_TOOLS) {
			assert.ok(tools.has(name), name);
		}
		assert.equal(tools.has("history_status"), false);
	});

	it("registers only advertised wrapped tools", () => {
		const advertised = parseListTools(`${LIST_TOOLS}\nhistory_status: Status\nhistory_query: Query\n`);
		assert.deepEqual(advertisedWrappedTools(advertised), [...HISTORY_TOOLS, ...ACTION_TOOLS]);
		assert.deepEqual(
			advertisedWrappedTools(parseListTools(LIST_TOOLS)),
			[...ACTION_TOOLS],
		);
	});

	it("rejects reversed history query bounds", () => {
		assert.equal(invalidHistoryQueryRange({ since_sequence: 10, until_sequence: 4 }), true);
		assert.equal(invalidHistoryQueryRange({ since_sequence: 4, until_sequence: 10 }), false);
		assert.equal(invalidHistoryQueryRange({ since_sequence: 4 }), false);
	});

	it("detects a missing binary and unknown history CLI", () => {
		assert.equal(isBinaryMissing({ stdout: "", stderr: "cua-driver: not found", code: 127, killed: false }), true);
		assert.equal(
			looksLikeUnknownHistoryCommand({
				stdout: "",
				stderr: "unrecognized subcommand 'history'",
				code: 2,
				killed: false,
			}),
			true,
		);
	});
});
