import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { repoRoot } from "./helpers.ts";

describe("computer-history skill", () => {
	const skill = readFileSync(join(repoRoot, "skills/computer-history/SKILL.md"), "utf8");

	it("has frontmatter that triggers continue and recent-Cua-work requests", () => {
		assert.match(skill, /^---\nname: computer-history\n/m);
		assert.match(skill, /continue, resume, recall-recent-Cua-work/);
		assert.match(skill, /Do not load this skill for unrelated/);
	});

	it("requires status before query and forbids reconstructing omitted fields", () => {
		assert.match(skill, /Call `history_status` first/);
		assert.match(skill, /before.*list_apps/s);
		assert.match(skill, /typed text, screenshots, clipboard/);
		assert.match(skill, /Do not enable, pause, resume, disable, delete/);
	});
});
