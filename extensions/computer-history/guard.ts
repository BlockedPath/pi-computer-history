import {
	isToolCallEventType,
	type ExtensionAPI,
} from "@earendil-works/pi-coding-agent";

const HISTORY_STORE_PATH = /cua-driver(?:-local)?[/\\]computer-history/i;
const HISTORY_CLI =
	/\bcua-driver(?:-local)?(?:\s+call)?\s+(history\b|history_status\b|history_query\b)/i;

function isHistoryStorePath(value: string): boolean {
	return HISTORY_STORE_PATH.test(value);
}

function blockedReason(kind: "store" | "cli"): string {
	if (kind === "store") {
		return "Direct Computer History store access is blocked. Use history_status and history_query.";
	}
	return "Cua Computer History must go through history_status and history_query, not bash or cua-driver history.";
}

export function classifyHistoryBypass(
	kind: "bash" | "path",
	value: string,
): "store" | "cli" | undefined {
	if (isHistoryStorePath(value)) return "store";
	if (kind === "bash" && HISTORY_CLI.test(value)) return "cli";
	return undefined;
}

function inspectPath(value: unknown): "store" | undefined {
	if (typeof value !== "string") return undefined;
	return classifyHistoryBypass("path", value) === "store" ? "store" : undefined;
}

export function registerStoreGuard(pi: ExtensionAPI): void {
	pi.on("tool_call", (event) => {
		if (isToolCallEventType("bash", event)) {
			const kind = classifyHistoryBypass("bash", event.input.command);
			if (kind) return { block: true, reason: blockedReason(kind) };
			return undefined;
		}

		if (isToolCallEventType("read", event) && inspectPath(event.input.path)) {
			return { block: true, reason: blockedReason("store") };
		}
		if (isToolCallEventType("write", event) && inspectPath(event.input.path)) {
			return { block: true, reason: blockedReason("store") };
		}
		if (isToolCallEventType("edit", event) && inspectPath(event.input.path)) {
			return { block: true, reason: blockedReason("store") };
		}
		if (isToolCallEventType("grep", event) && inspectPath(event.input.path)) {
			return { block: true, reason: blockedReason("store") };
		}
		if (isToolCallEventType("find", event) && inspectPath(event.input.path)) {
			return { block: true, reason: blockedReason("store") };
		}
		if (isToolCallEventType("ls", event) && inspectPath(event.input.path)) {
			return { block: true, reason: blockedReason("store") };
		}
		return undefined;
	});
}
