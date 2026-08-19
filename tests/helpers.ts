import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

export const repoRoot = fileURLToPath(new URL("..", import.meta.url));

export function piBin(): string {
	const dir = join(repoRoot, "node_modules", ".bin");
	for (const name of ["pi", "pi.cmd"]) {
		const candidate = join(dir, name);
		if (existsSync(candidate)) return candidate;
	}
	return "pi";
}

export function runPi(
	args: string[],
	options?: { timeout?: number },
): { status: number | null; stdout: string; stderr: string } {
	const result = spawnSync(piBin(), args, {
		cwd: repoRoot,
		encoding: "utf8",
		timeout: options?.timeout ?? 30_000,
		env: process.env,
	});
	return {
		status: result.status,
		stdout: result.stdout ?? "",
		stderr: result.stderr ?? "",
	};
}
