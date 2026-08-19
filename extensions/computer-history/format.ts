import {
	DEFAULT_MAX_BYTES,
	DEFAULT_MAX_LINES,
	formatSize,
	truncateHead,
} from "@earendil-works/pi-coding-agent";

export interface CuaPayload {
	text: string;
	json: unknown;
}

export interface HistoryEventSummary {
	sequence?: number;
	type?: string;
	time?: string;
	capability?: string;
	application?: string;
	effect?: string;
	route?: string;
	session_id?: string;
}

function tryParseJson(text: string): unknown {
	const trimmed = text.trim();
	if (!trimmed) return undefined;
	try {
		return JSON.parse(trimmed);
	} catch {
		const start = trimmed.search(/[{\[]/);
		if (start <= 0) return undefined;
		try {
			return JSON.parse(trimmed.slice(start));
		} catch {
			return undefined;
		}
	}
}

export function parseCuaStdout(stdout: string): CuaPayload {
	const json = tryParseJson(stdout);
	if (json === undefined) {
		return { text: stdout.trim(), json: undefined };
	}
	return { text: stdout.trim(), json };
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
	if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
	return value as Record<string, unknown>;
}

function asString(value: unknown): string | undefined {
	return typeof value === "string" && value.length > 0 ? value : undefined;
}

function asNumber(value: unknown): number | undefined {
	return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

export function extractStructured(json: unknown): Record<string, unknown> | undefined {
	const root = asRecord(json);
	if (!root) return undefined;
	const structured = asRecord(root.structuredContent) ?? asRecord(root.structured_content);
	return structured ?? root;
}

export function summarizeHistoryEvent(event: unknown): HistoryEventSummary | undefined {
	const envelope = asRecord(event);
	if (!envelope) return undefined;
	const data = asRecord(envelope.data);
	const payload = asRecord(data?.payload);
	const application = asRecord(data?.application);
	const summary: HistoryEventSummary = {};
	const sequence = asNumber(data?.sequence);
	if (sequence !== undefined) summary.sequence = sequence;
	const type = asString(envelope.type);
	if (type) summary.type = type;
	const time = asString(envelope.time);
	if (time) summary.time = time;
	const capability = asString(data?.capability);
	if (capability) summary.capability = capability;
	const applicationName = asString(application?.display_name) ?? asString(application?.bundle_id);
	if (applicationName) summary.application = applicationName;
	const effect = asString(payload?.effect);
	if (effect) summary.effect = effect;
	const route = asString(payload?.route);
	if (route) summary.route = route;
	const sessionId = asString(data?.session_id);
	if (sessionId) summary.session_id = sessionId;
	return Object.keys(summary).length > 0 ? summary : undefined;
}

export function formatHistoryStatus(json: unknown, fallback: string): string {
	const status = extractStructured(json);
	if (!status) return fallback;
	const lines = [
		`supported=${String(status.supported ?? "unknown")}`,
		`admitted=${String(status.admitted ?? "unknown")}`,
		`enabled=${String(status.enabled ?? "unknown")}`,
		`paused=${String(status.paused ?? "unknown")}`,
		`health=${String(status.health ?? "unknown")}`,
		`encrypted=${String(status.encrypted ?? "unknown")}`,
	];
	if (status.dropped_events !== undefined) lines.push(`dropped_events=${String(status.dropped_events)}`);
	if (status.retention_days !== undefined) lines.push(`retention_days=${String(status.retention_days)}`);
	if (status.bytes_used !== undefined) lines.push(`bytes_used=${String(status.bytes_used)}`);
	if (status.quota_bytes !== undefined) lines.push(`quota_bytes=${String(status.quota_bytes)}`);
	if (status.profile) lines.push(`profile=${String(status.profile)}`);
	lines.push(
		"Treat disabled, paused, unhealthy, or dropped-event state as incomplete. Do not claim a full transcript.",
	);
	return lines.join("\n");
}

export function formatHistoryQuery(json: unknown, fallback: string): {
	text: string;
	events: HistoryEventSummary[];
} {
	const payload = extractStructured(json);
	const rawEvents = Array.isArray(payload?.events) ? payload.events : [];
	const events = rawEvents
		.map(summarizeHistoryEvent)
		.filter((event): event is HistoryEventSummary => event !== undefined);

	if (events.length === 0) {
		const empty = [
			"No history events in this slice.",
			`metadata_only=${String(payload?.metadata_only ?? true)}`,
			`model_context_disclosure=${String(payload?.model_context_disclosure ?? true)}`,
			"Omitted fields stay unknown: typed text, screenshots, paths, titles, URLs, arguments, results, and intent.",
		];
		return { text: payload ? empty.join("\n") : fallback, events };
	}

	const lines = events.map((event) => {
		const parts: string[] = [];
		if (event.sequence !== undefined) parts.push(`seq=${event.sequence}`);
		if (event.time) parts.push(event.time);
		if (event.capability) parts.push(event.capability);
		if (event.application) parts.push(event.application);
		if (event.effect) parts.push(`effect=${event.effect}`);
		if (event.route) parts.push(`route=${event.route}`);
		if (event.session_id) parts.push(`session=${event.session_id}`);
		if (event.type) parts.push(event.type);
		return parts.join(" ");
	});
	lines.push(`events=${events.length}`);
	lines.push(`metadata_only=${String(payload?.metadata_only ?? true)}`);
	lines.push(`model_context_disclosure=${String(payload?.model_context_disclosure ?? true)}`);
	lines.push(
		"Metadata only. Do not reconstruct omitted content, geometry, arguments, results, or user intent.",
	);
	return { text: lines.join("\n"), events };
}

function formatElements(elements: unknown): string | undefined {
	if (!Array.isArray(elements) || elements.length === 0) return undefined;
	const rows: string[] = ["index\trole\tlabel\ttoken"];
	for (const item of elements) {
		const element = asRecord(item);
		if (!element) continue;
		const index = element.element_index ?? "";
		const role = asString(element.role) ?? "";
		const label = (asString(element.label) ?? "").replaceAll("\t", " ");
		const token = asString(element.element_token) ?? "";
		rows.push(`${index}\t${role}\t${label}\t${token}`);
	}
	return rows.join("\n");
}

export function formatWindowState(json: unknown, fallback: string): string {
	const payload = extractStructured(json);
	if (!payload) return fallback;
	const lines: string[] = [];
	if (payload.snapshot_id) lines.push(`snapshot_id=${String(payload.snapshot_id)}`);
	if (payload.pid !== undefined) lines.push(`pid=${String(payload.pid)}`);
	if (payload.window_id !== undefined) lines.push(`window_id=${String(payload.window_id)}`);
	if (payload.element_count !== undefined) lines.push(`element_count=${String(payload.element_count)}`);
	if (payload.filtered_element_count !== undefined) {
		lines.push(`filtered_element_count=${String(payload.filtered_element_count)}`);
	}
	if (payload.degraded_reason) lines.push(`degraded_reason=${String(payload.degraded_reason)}`);
	if (payload.screenshot_file_path) {
		lines.push(`screenshot_file_path=${String(payload.screenshot_file_path)}`);
	}
	const elements = formatElements(payload.elements);
	if (elements) {
		lines.push("elements:");
		lines.push(elements);
	} else if (typeof payload.tree_markdown === "string" && payload.tree_markdown.trim()) {
		lines.push(payload.tree_markdown.trim());
	}
	return lines.length > 0 ? lines.join("\n") : fallback;
}

export function formatGenericJson(json: unknown, fallback: string): string {
	if (json === undefined) return fallback;
	try {
		return JSON.stringify(json, null, 2);
	} catch {
		return fallback;
	}
}

export async function truncateForModel(
	text: string,
	writeFull?: (full: string) => Promise<string>,
): Promise<{ text: string; truncated: boolean; fullOutputPath?: string }> {
	const truncation = truncateHead(text, {
		maxLines: DEFAULT_MAX_LINES,
		maxBytes: DEFAULT_MAX_BYTES,
	});
	if (!truncation.truncated) {
		return { text: truncation.content, truncated: false };
	}
	let fullOutputPath: string | undefined;
	if (writeFull) {
		fullOutputPath = await writeFull(text);
	}
	let result = truncation.content;
	result += `\n\n[Output truncated: ${truncation.outputLines} of ${truncation.totalLines} lines`;
	result += ` (${formatSize(truncation.outputBytes)} of ${formatSize(truncation.totalBytes)}).`;
	if (fullOutputPath) {
		result += ` Full output saved to: ${fullOutputPath}`;
	}
	result += "]";
	return { text: result, truncated: true, fullOutputPath };
}

export function extractErrorCode(json: unknown, text: string): string | undefined {
	const payload = extractStructured(json);
	const code = asString(payload?.code);
	if (code) return code;
	const match = text.match(/\b(history_[a-z0-9_]+|invalid_history_query(?:_range)?)\b/);
	return match?.[1];
}
