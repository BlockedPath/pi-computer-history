import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { registerHistoryCommand } from "./commands.ts";
import { registerStoreGuard } from "./guard.ts";
import { discoverAndRegisterTools } from "./tools.ts";

export default function computerHistoryExtension(pi: ExtensionAPI) {
	pi.registerFlag("cua-driver-bin", {
		description: "Path to the cua-driver executable (overrides CUA_DRIVER_BIN)",
		type: "string",
	});

	registerStoreGuard(pi);
	registerHistoryCommand(pi);

	pi.on("session_start", async (_event, ctx) => {
		await discoverAndRegisterTools(pi, ctx);
	});
}
