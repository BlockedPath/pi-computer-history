import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
	extractErrorCode,
	formatHistoryQuery,
	formatHistoryStatus,
	formatWindowState,
	parseCuaStdout,
} from "../extensions/computer-history/format.ts";

const SAMPLE_EVENT = {
	specversion: "1.0",
	type: "cua-driver.history.action_completed.v0",
	time: "2026-08-14T12:00:00Z",
	data: {
		session_id: "33333333333333333333333333333333",
		sequence: 42,
		capability: "computer.pointer.click",
		application: { display_name: "Example App" },
		payload: { kind: "action_completed", effect: "confirmed", route: "accessibility" },
	},
};

describe("format", () => {
	it("parses JSON after a text prefix", () => {
		const parsed = parseCuaStdout('ok\n{"health":"ready"}');
		assert.deepEqual(parsed.json, { health: "ready" });
	});

	it("formats history status without claiming completeness", () => {
		const text = formatHistoryStatus(
			{
				supported: true,
				admitted: true,
				enabled: true,
				paused: false,
				encrypted: true,
				health: "ready",
				dropped_events: 0,
			},
			"fallback",
		);
		assert.match(text, /health=ready/);
		assert.match(text, /dropped_events=0/);
		assert.match(text, /incomplete/);
	});

	it("summarizes history events as metadata only", () => {
		const query = formatHistoryQuery(
			{
				events: [SAMPLE_EVENT],
				metadata_only: true,
				model_context_disclosure: true,
			},
			"fallback",
		);
		assert.equal(query.events.length, 1);
		assert.equal(query.events[0]?.sequence, 42);
		assert.match(query.text, /seq=42/);
		assert.match(query.text, /computer\.pointer\.click/);
		assert.match(query.text, /Example App/);
		assert.match(query.text, /metadata_only=true/);
		assert.doesNotMatch(query.text, /password|typed text|screenshot contents/i);
	});

	it("formats an empty query slice without inventing events", () => {
		const query = formatHistoryQuery({ events: [], metadata_only: true }, "fallback");
		assert.equal(query.events.length, 0);
		assert.match(query.text, /No history events/);
	});

	it("extracts structured history error codes", () => {
		assert.equal(extractErrorCode({ code: "invalid_history_query_range" }, "nope"), "invalid_history_query_range");
		assert.equal(extractErrorCode({}, "failed: history_key_locked"), "history_key_locked");
	});

	it("formats window state without embedding screenshots", () => {
		const text = formatWindowState(
			{
				snapshot_id: "s12ab34cd",
				pid: 99,
				window_id: 1,
				element_count: 1,
				elements: [{ element_index: 0, role: "button", label: "OK", element_token: "tok" }],
			},
			"fallback",
		);
		assert.match(text, /snapshot_id=s12ab34cd/);
		assert.match(text, /0\tbutton\tOK\ttok/);
		assert.doesNotMatch(text, /base64/);
	});
});
