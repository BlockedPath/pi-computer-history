import type { AutocompleteItem } from "@earendil-works/pi-tui";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { historyCli, looksLikeUnknownHistoryCommand, resolveCuaBin } from "./cua.ts";

export const HISTORY_SUBCOMMANDS = [
	"status",
	"list",
	"show",
	"enable",
	"pause",
	"resume",
	"disable",
	"delete",
] as const;
export type HistorySubcommand = (typeof HISTORY_SUBCOMMANDS)[number];

export function parseHistoryArgs(
	raw: string,
): { command: HistorySubcommand; rest: string[] } | { error: string } {
	const parts = raw.trim().split(/\s+/).filter(Boolean);
	if (parts.length === 0) return { command: "status", rest: [] };
	const command = parts[0];
	if (!(HISTORY_SUBCOMMANDS as readonly string[]).includes(command)) {
		return {
			error: `Usage: /history [${HISTORY_SUBCOMMANDS.join("|")}] [args]`,
		};
	}
	return { command: command as HistorySubcommand, rest: parts.slice(1) };
}

export function nightlyHint(): string {
	return [
		"Computer History is a Cua Driver nightly preview.",
		"Switch channel, update, then enable capture:",
		"  cua-driver channel set nightly",
		"  cua-driver update --apply",
		"  cua-driver history enable",
		"Agents still cannot enable, pause, delete, or export history through tools.",
	].join("\n");
}

export function registerHistoryCommand(pi: ExtensionAPI): void {
	pi.registerCommand("history", {
		description: "Inspect or control local Cua Computer History (user-only)",
		getArgumentCompletions: (prefix: string): AutocompleteItem[] | null => {
			const items = HISTORY_SUBCOMMANDS.filter((name) => name.startsWith(prefix)).map((name) => ({
				value: name,
				label: name,
			}));
			return items.length > 0 ? items : null;
		},
		handler: async (args, ctx) => {
			const parsed = parseHistoryArgs(args);
			if ("error" in parsed) {
				ctx.ui.notify(parsed.error, "warning");
				return;
			}

			const bin = resolveCuaBin(pi);
			let argv: string[];
			switch (parsed.command) {
				case "status":
					argv = ["status", "--json"];
					break;
				case "list": {
					const limit = parsed.rest[0] ?? "50";
					argv = ["list", limit, "--json"];
					break;
				}
				case "show": {
					const sequence = parsed.rest[0];
					if (!sequence) {
						ctx.ui.notify("Usage: /history show <sequence>", "warning");
						return;
					}
					argv = ["show", sequence, "--json"];
					break;
				}
				case "enable":
					argv = ["enable"];
					break;
				case "pause":
					argv = ["pause"];
					break;
				case "resume":
					argv = ["resume"];
					break;
				case "disable":
					argv = ["disable"];
					break;
				case "delete":
					argv = ["delete", "--yes"];
					break;
			}

			if (parsed.command === "enable" && ctx.hasUI) {
				const ok = await ctx.ui.confirm(
					"Enable Computer History?",
					"This admits the experimental preview and turns on capture of Cua-mediated actions. It does not grant agents read access by itself.",
				);
				if (!ok) return;
			}

			if (parsed.command === "delete" && ctx.hasUI) {
				const ok = await ctx.ui.confirm(
					"Delete Computer History?",
					"This destroys the namespace key and encrypted store. It is not physical erasure from snapshots or backups.",
				);
				if (!ok) return;
			}

			const result = await historyCli(pi, argv, ctx.signal);
			const output = (result.stdout || result.stderr).trim();
			if (result.code === 0) {
				ctx.ui.notify(output || `${bin} history ${parsed.command} ok`, "info");
				if (ctx.hasUI) {
					ctx.ui.setStatus("computer-history", `history ${parsed.command}`);
				}
				return;
			}

			if (looksLikeUnknownHistoryCommand(result) || /unexpected argument|unrecognized subcommand/i.test(output)) {
				ctx.ui.notify(`${output || "history CLI unavailable"}\n\n${nightlyHint()}`, "warning");
				return;
			}
			ctx.ui.notify(output || `${bin} history ${parsed.command} failed (${result.code})`, "error");
		},
	});
}
