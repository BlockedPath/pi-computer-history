import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { piBin, repoRoot, runPi } from "./helpers.ts";

describe("package load", () => {
	it("declares existing extension and skill paths in the pi manifest", () => {
		const pkg = JSON.parse(readFileSync(join(repoRoot, "package.json"), "utf8")) as {
			keywords?: string[];
			pi?: { extensions?: string[]; skills?: string[] };
		};
		assert.ok(pkg.keywords?.includes("pi-package"));
		assert.deepEqual(pkg.pi?.extensions, ["./extensions/computer-history/index.ts"]);
		assert.deepEqual(pkg.pi?.skills, ["./skills"]);
		assert.ok(existsSync(join(repoRoot, "extensions/computer-history/index.ts")));
		assert.ok(existsSync(join(repoRoot, "skills/computer-history/SKILL.md")));
	});

	it("loads the extension into pi and registers --cua-driver-bin", () => {
		assert.ok(existsSync(piBin()) || piBin() === "pi", `pi binary missing: ${piBin()}`);
		const result = runPi(["-e", repoRoot, "--help"]);
		const output = `${result.stdout}\n${result.stderr}`;
		assert.equal(result.status, 0, output);
		assert.match(output, /--cua-driver-bin/);
		assert.match(output, /overrides CUA_DRIVER_BIN/);
	});
});
