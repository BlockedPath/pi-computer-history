import type { ExecResult, ExtensionAPI } from "@earendil-works/pi-coding-agent";

export const HISTORY_TOOLS = ["history_status", "history_query"] as const;
export const ACTION_TOOLS = [
	"list_apps",
	"list_windows",
	"get_window_state",
	"click",
	"type_text",
] as const;
export const WRAPPED_TOOLS = [...HISTORY_TOOLS, ...ACTION_TOOLS] as const;

export type WrappedToolName = (typeof WRAPPED_TOOLS)[number];

const DEFAULT_TIMEOUT_MS = 45_000;
const WINDOW_STATE_TIMEOUT_MS = 60_000;

export function resolveCuaBin(pi: ExtensionAPI): string {
	const flag = pi.getFlag("cua-driver-bin");
	if (typeof flag === "string" && flag.trim()) return flag.trim();
	const env = process.env.CUA_DRIVER_BIN?.trim();
	if (env) return env;
	return "cua-driver";
}

export function isBinaryMissing(result: ExecResult): boolean {
	if (result.code === 127) return true;
	const text = `${result.stderr}\n${result.stdout}`;
	return /not found|ENOENT|No such file/i.test(text);
}

export function parseListTools(stdout: string): Set<string> {
	const names = new Set<string>();
	for (const line of stdout.split("\n")) {
		const match = line.match(/^([a-z][a-z0-9_]*)\s*:/);
		if (match) names.add(match[1]);
	}
	return names;
}

export async function cuaExec(
	pi: ExtensionAPI,
	args: string[],
	options?: { signal?: AbortSignal; timeout?: number },
): Promise<ExecResult> {
	return pi.exec(resolveCuaBin(pi), args, {
		signal: options?.signal,
		timeout: options?.timeout ?? DEFAULT_TIMEOUT_MS,
	});
}

export async function listAdvertisedTools(
	pi: ExtensionAPI,
	signal?: AbortSignal,
): Promise<{ ok: true; tools: Set<string> } | { ok: false; missingBinary: boolean; detail: string }> {
	const result = await cuaExec(pi, ["list-tools"], { signal, timeout: 15_000 });
	if (result.code === 0) {
		return { ok: true, tools: parseListTools(result.stdout) };
	}
	const detail = (result.stderr || result.stdout).trim() || `cua-driver list-tools exited ${result.code}`;
	return { ok: false, missingBinary: isBinaryMissing(result), detail };
}

export async function callCuaTool(
	pi: ExtensionAPI,
	tool: string,
	args: unknown,
	signal?: AbortSignal,
): Promise<ExecResult> {
	const timeout = tool === "get_window_state" ? WINDOW_STATE_TIMEOUT_MS : DEFAULT_TIMEOUT_MS;
	return cuaExec(pi, ["call", tool, JSON.stringify(args ?? {})], { signal, timeout });
}

export async function historyCli(
	pi: ExtensionAPI,
	argv: string[],
	signal?: AbortSignal,
): Promise<ExecResult> {
	return cuaExec(pi, ["history", ...argv], { signal, timeout: DEFAULT_TIMEOUT_MS });
}

export function looksLikeUnknownHistoryCommand(result: ExecResult): boolean {
	const text = `${result.stderr}\n${result.stdout}`;
	return /unknown (command|subcommand|tool)|unrecognized|history is not|experimental/i.test(text);
}
