import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { StringEnum } from "@earendil-works/pi-ai";
import type {
	AgentToolResult,
	ExtensionAPI,
	ExtensionContext,
} from "@earendil-works/pi-coding-agent";
import { Text } from "@earendil-works/pi-tui";
import { type Static, Type } from "typebox";
import {
	ACTION_TOOLS,
	callCuaTool,
	HISTORY_TOOLS,
	listAdvertisedTools,
	type WrappedToolName,
} from "./cua.ts";
import {
	extractErrorCode,
	formatGenericJson,
	formatHistoryQuery,
	formatHistoryStatus,
	formatWindowState,
	type HistoryEventSummary,
	parseCuaStdout,
	truncateForModel,
} from "./format.ts";

interface CuaToolDetails {
	tool: string;
	exitCode: number;
	code?: string;
	events?: HistoryEventSummary[];
	truncated?: boolean;
	fullOutputPath?: string;
}

const registered = new Set<WrappedToolName>();

const EmptyParams = Type.Object({}, { additionalProperties: false });

const HistoryQueryParams = Type.Object(
	{
		limit: Type.Optional(
			Type.Integer({
				minimum: 1,
				maximum: 200,
				description: "Maximum matching events. Default 50.",
			}),
		),
		session_id: Type.Optional(
			Type.String({
				minLength: 1,
				maxLength: 128,
				description: "Opaque history session id, or a caller-known session label.",
			}),
		),
		since_sequence: Type.Optional(
			Type.Integer({ minimum: 1, description: "Inclusive lower sequence bound." }),
		),
		until_sequence: Type.Optional(
			Type.Integer({ minimum: 1, description: "Inclusive upper sequence bound." }),
		),
	},
	{ additionalProperties: false },
);

const ListWindowsParams = Type.Object(
	{
		pid: Type.Optional(Type.Integer({ minimum: 0, description: "Optional pid filter." })),
		on_screen_only: Type.Optional(
			Type.Boolean({ description: "When true, drop windows not on the current Space." }),
		),
	},
	{ additionalProperties: false },
);

const GetWindowStateParams = Type.Object(
	{
		pid: Type.Integer({ minimum: 0, description: "Target process ID." }),
		window_id: Type.Integer({ minimum: 0, description: "Target window ID from list_windows." }),
		query: Type.Optional(
			Type.String({ description: "Case-insensitive filter for elements and markdown." }),
		),
		max_elements: Type.Optional(Type.Integer({ minimum: 1, description: "Cap AX nodes walked." })),
		max_depth: Type.Optional(Type.Integer({ minimum: 1, description: "Cap AX walk depth." })),
		include_screenshot: Type.Optional(
			Type.Boolean({
				description:
					"This wrapper defaults to false to protect model context. Set true only for pixel targeting.",
			}),
		),
		session: Type.Optional(Type.String({ description: "Optional Cua lifecycle session label." })),
	},
	{ additionalProperties: false },
);

const ClickParams = Type.Object(
	{
		pid: Type.Optional(Type.Integer({ minimum: 0, description: "Target process ID." })),
		window_id: Type.Optional(Type.Integer({ minimum: 0, description: "Target window ID." })),
		element_token: Type.Optional(
			Type.String({ description: "Preferred opaque element handle from get_window_state." }),
		),
		element_index: Type.Optional(Type.Integer({ description: "Element index from get_window_state." })),
		snapshot_id: Type.Optional(
			Type.String({
				pattern: "^s[0-9a-f]{8}$",
				description: "Snapshot handle required with element_index.",
			}),
		),
		x: Type.Optional(Type.Number({ description: "Screenshot-pixel X when not using an element token." })),
		y: Type.Optional(Type.Number({ description: "Screenshot-pixel Y when not using an element token." })),
		button: Type.Optional(StringEnum(["left", "right", "middle"] as const)),
		delivery_mode: Type.Optional(StringEnum(["background", "foreground"] as const)),
		session: Type.Optional(Type.String({ description: "Optional Cua lifecycle session label." })),
	},
	{ additionalProperties: false },
);

const TypeTextParams = Type.Object(
	{
		text: Type.String({ description: "Text to insert at the target. Never stored in Computer History." }),
		pid: Type.Optional(Type.Integer({ minimum: 0, description: "Target process ID." })),
		window_id: Type.Optional(Type.Integer({ minimum: 0, description: "Target window ID." })),
		element_token: Type.Optional(
			Type.String({ description: "Preferred opaque element handle from get_window_state." }),
		),
		element_index: Type.Optional(Type.Integer({ description: "Element index from get_window_state." })),
		snapshot_id: Type.Optional(
			Type.String({
				pattern: "^s[0-9a-f]{8}$",
				description: "Snapshot handle required with element_index.",
			}),
		),
		x: Type.Optional(Type.Number({ description: "Screenshot-pixel X for the pixel typing path." })),
		y: Type.Optional(Type.Number({ description: "Screenshot-pixel Y for the pixel typing path." })),
		delivery_mode: Type.Optional(StringEnum(["background", "foreground"] as const)),
		session: Type.Optional(Type.String({ description: "Optional Cua lifecycle session label." })),
	},
	{ additionalProperties: false },
);

async function writeFullOutput(text: string): Promise<string> {
	const dir = await mkdtemp(join(tmpdir(), "pi-computer-history-"));
	const file = join(dir, "output.txt");
	await writeFile(file, text, "utf8");
	return file;
}

function compactCall(name: string, args: object, theme: ExtensionContext["ui"]["theme"]): Text {
	const keys = Object.entries(args as Record<string, unknown>)
		.filter(([, value]) => value !== undefined)
		.map(([key, value]) => `${key}=${typeof value === "string" ? value : JSON.stringify(value)}`);
	const suffix = keys.length > 0 ? theme.fg("dim", ` ${keys.slice(0, 4).join(" ")}`) : "";
	return new Text(theme.fg("toolTitle", theme.bold(name)) + suffix, 0, 0);
}

function compactResult(result: AgentToolResult<CuaToolDetails>, theme: ExtensionContext["ui"]["theme"]): Text {
	if (result.details?.code) {
		return new Text(theme.fg("error", result.details.code), 0, 0);
	}
	if (result.details?.events) {
		return new Text(theme.fg("success", `${result.details.events.length} history events`), 0, 0);
	}
	const first = result.content[0];
	const preview =
		first && "text" in first ? first.text.split("\n")[0] ?? "ok" : result.details?.exitCode === 0 ? "ok" : "error";
	const color = result.details?.exitCode === 0 ? "success" : "error";
	return new Text(theme.fg(color, preview.slice(0, 120)), 0, 0);
}

async function runCuaTool(
	pi: ExtensionAPI,
	tool: WrappedToolName,
	params: unknown,
	signal: AbortSignal | undefined,
	format: (json: unknown, fallback: string) => string | { text: string; events?: HistoryEventSummary[] },
): Promise<AgentToolResult<CuaToolDetails>> {
	const result = await callCuaTool(pi, tool, params, signal);
	const fallback = (result.stdout || result.stderr).trim() || `${tool} exited ${result.code}`;
	const parsed = parseCuaStdout(result.stdout || result.stderr);
	const formatted = format(parsed.json, fallback);
	const text = typeof formatted === "string" ? formatted : formatted.text;
	const events = typeof formatted === "string" ? undefined : formatted.events;
	const truncated = await truncateForModel(text, writeFullOutput);
	const code = result.code === 0 ? undefined : extractErrorCode(parsed.json, fallback);
	return {
		content: [{ type: "text", text: truncated.text }],
		details: {
			tool,
			exitCode: result.code,
			code,
			events,
			truncated: truncated.truncated,
			fullOutputPath: truncated.fullOutputPath,
		},
	};
}

export async function discoverAndRegisterTools(
	pi: ExtensionAPI,
	ctx: ExtensionContext,
): Promise<void> {
	const listed = await listAdvertisedTools(pi, ctx.signal);
	if (!listed.ok) {
		if (ctx.hasUI) {
			ctx.ui.setStatus("computer-history", listed.missingBinary ? "cua-driver missing" : "cua-driver error");
			ctx.ui.notify(
				listed.missingBinary
					? "cua-driver not found. Install Cua Driver or set CUA_DRIVER_BIN."
					: listed.detail,
				"warning",
			);
		}
		return;
	}

	const advertised = listed.tools;

	if (advertised.has("history_status") && !registered.has("history_status")) {
		registered.add("history_status");
		pi.registerTool({
			name: "history_status",
			label: "History Status",
			description:
				"Read-only Cua Computer History operational status. Never returns events. Requires history.status. Call this before history_query.",
			promptSnippet: "Check whether Cua Computer History is admitted, enabled, paused, or unhealthy",
			promptGuidelines: [
				"Use history_status before history_query, and before list_apps, list_windows, or get_window_state, when the user asks to continue, resume, recall recent Cua activity, or explain what a prior Cua run did.",
				"After absence, denial, empty results, or a recoverable history_status error, continue the original task without history.",
			],
			parameters: EmptyParams,
			async execute(_id, _params, signal) {
				return runCuaTool(pi, "history_status", {}, signal, formatHistoryStatus);
			},
			renderCall: (args, theme) => compactCall("history_status", args, theme),
			renderResult: (result, _options, theme) => compactResult(result, theme),
		});
	}

	if (advertised.has("history_query") && !registered.has("history_query")) {
		registered.add("history_query");
		pi.registerTool({
			name: "history_query",
			label: "History Query",
			description:
				"Read-only bounded Cua Computer History event slice. Metadata only. Requires history.query. Default limit 50, maximum 200.",
			promptSnippet: "Query a bounded metadata-only slice of recent Cua-mediated actions",
			promptGuidelines: [
				"Use history_query only after history_status shows a useful read. Cap history_query limit at 50 unless paging with until_sequence or since_sequence.",
				"Treat history_query events as metadata-only evidence, not a transcript. Typed text, screenshots, paths, titles, URLs, arguments, results, and intent stay unknown.",
			],
			parameters: HistoryQueryParams,
			async execute(_id, params, signal) {
				if (
					params.since_sequence !== undefined &&
					params.until_sequence !== undefined &&
					params.since_sequence > params.until_sequence
				) {
					return {
						content: [
							{
								type: "text",
								text: JSON.stringify({
									code: "invalid_history_query_range",
									message: "since_sequence must not exceed until_sequence",
								}),
							},
						],
						details: {
							tool: "history_query",
							exitCode: 1,
							code: "invalid_history_query_range",
						},
					};
				}
				return runCuaTool(pi, "history_query", params, signal, formatHistoryQuery);
			},
			renderCall: (args, theme) => compactCall("history_query", args, theme),
			renderResult: (result, _options, theme) => compactResult(result, theme),
		});
	}

	if (advertised.has("list_apps") && !registered.has("list_apps")) {
		registered.add("list_apps");
		pi.registerTool({
			name: "list_apps",
			label: "List Apps",
			description: "List running and installed desktop apps with pid and bundle identity.",
			promptSnippet: "List running and installed apps before targeting a window",
			promptGuidelines: [
				"Use list_apps as a lead after history_query names an application, then verify current state. Do not reconstruct omitted history fields from the live desktop.",
			],
			parameters: EmptyParams,
			async execute(_id, _params, signal) {
				return runCuaTool(pi, "list_apps", {}, signal, formatGenericJson);
			},
			renderCall: (args, theme) => compactCall("list_apps", args, theme),
			renderResult: (result, _options, theme) => compactResult(result, theme),
		});
	}

	if (advertised.has("list_windows") && !registered.has("list_windows")) {
		registered.add("list_windows");
		pi.registerTool({
			name: "list_windows",
			label: "List Windows",
			description: "List top-level windows, optionally filtered by pid. Use window_id with get_window_state.",
			promptSnippet: "List windows to obtain window_id for get_window_state",
			promptGuidelines: [
				"Use list_windows to obtain window_id values for get_window_state after identifying a pid with list_apps.",
			],
			parameters: ListWindowsParams,
			async execute(_id, params, signal) {
				return runCuaTool(pi, "list_windows", params, signal, formatGenericJson);
			},
			renderCall: (args, theme) => compactCall("list_windows", args, theme),
			renderResult: (result, _options, theme) => compactResult(result, theme),
		});
	}

	if (advertised.has("get_window_state") && !registered.has("get_window_state")) {
		registered.add("get_window_state");
		pi.registerTool({
			name: "get_window_state",
			label: "Window State",
			description:
				"Snapshot one window's accessibility tree. This wrapper defaults include_screenshot to false. Call once per turn per (pid, window_id) before element-indexed click or type_text.",
			promptSnippet: "Snapshot one window before click or type_text",
			promptGuidelines: [
				"Use get_window_state once per turn per (pid, window_id) before click or type_text with element_index or element_token. Leave include_screenshot false unless pixel targeting is required.",
			],
			parameters: GetWindowStateParams,
			executionMode: "sequential",
			prepareArguments(args): Static<typeof GetWindowStateParams> {
				const input = args && typeof args === "object" ? (args as Record<string, unknown>) : {};
				return {
					...input,
					include_screenshot: input.include_screenshot === undefined ? false : input.include_screenshot,
				} as Static<typeof GetWindowStateParams>;
			},
			async execute(_id, params, signal) {
				return runCuaTool(pi, "get_window_state", params, signal, formatWindowState);
			},
			renderCall: (args, theme) => compactCall("get_window_state", args, theme),
			renderResult: (result, _options, theme) => compactResult(result, theme),
		});
	}

	if (advertised.has("click") && !registered.has("click")) {
		registered.add("click");
		pi.registerTool({
			name: "click",
			label: "Click",
			description:
				"Click a Cua target. Prefer element_token from get_window_state. Use x,y only for surfaces absent from the accessibility tree.",
			promptSnippet: "Click an element_token or screenshot coordinate through Cua Driver",
			promptGuidelines: [
				"Prefer click with element_token from get_window_state over x,y coordinates.",
			],
			parameters: ClickParams,
			executionMode: "sequential",
			async execute(_id, params, signal) {
				return runCuaTool(pi, "click", params, signal, formatGenericJson);
			},
			renderCall: (args, theme) => compactCall("click", args, theme),
			renderResult: (result, _options, theme) => compactResult(result, theme),
		});
	}

	if (advertised.has("type_text") && !registered.has("type_text")) {
		registered.add("type_text");
		pi.registerTool({
			name: "type_text",
			label: "Type Text",
			description:
				"Type into a Cua target. Prefer element_token from get_window_state. Computer History may record that typing ran, never the characters.",
			promptSnippet: "Type text into a Cua target without storing keystrokes in history",
			promptGuidelines: [
				"Use type_text for Cua-mediated typing. Do not claim Computer History recorded the characters.",
			],
			parameters: TypeTextParams,
			executionMode: "sequential",
			async execute(_id, params, signal) {
				return runCuaTool(pi, "type_text", params, signal, formatGenericJson);
			},
			renderCall: (args, theme) => compactCall("type_text", args, theme),
			renderResult: (result, _options, theme) => compactResult(result, theme),
		});
	}

	if (ctx.hasUI) {
		const historyReady = HISTORY_TOOLS.every((name) => advertised.has(name));
		const actionCount = ACTION_TOOLS.filter((name) => advertised.has(name)).length;
		ctx.ui.setStatus(
			"computer-history",
			historyReady ? `history ready · ${actionCount} cua actions` : `history not admitted · ${actionCount} cua actions`,
		);
	}
}
