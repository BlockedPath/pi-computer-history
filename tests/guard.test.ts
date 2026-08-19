import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { classifyHistoryBypass } from "../extensions/computer-history/guard.ts";

describe("history access guard", () => {
	it("blocks cua-driver history CLI and call wrappers from bash", () => {
		assert.equal(classifyHistoryBypass("bash", "cua-driver history status"), "cli");
		assert.equal(classifyHistoryBypass("bash", "cua-driver call history_status"), "cli");
		assert.equal(classifyHistoryBypass("bash", "cua-driver call history_query '{\"limit\":20}'"), "cli");
		assert.equal(classifyHistoryBypass("bash", "cua-driver list_apps"), undefined);
	});

	it("blocks direct encrypted-store paths", () => {
		assert.equal(
			classifyHistoryBypass("path", "/Users/me/Library/Application Support/cua-driver/computer-history/chunk"),
			"store",
		);
		assert.equal(
			classifyHistoryBypass("bash", "cat ~/.local/state/cua-driver/computer-history/events"),
			"store",
		);
		assert.equal(classifyHistoryBypass("path", "/tmp/notes.md"), undefined);
	});
});
