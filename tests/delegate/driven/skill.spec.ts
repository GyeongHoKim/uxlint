/**
 * The skill must describe the CLI that exists.
 *
 * The skill is the only agent-facing part of this feature, and it is not code:
 * nothing compiles it, nothing type-checks it, and a flag it names that uxlint
 * does not have fails at the agent's *first* attempt — after a browser has
 * already been opened and every page captured.
 *
 * So the drift is checked here. This is the one test in the feature whose absence
 * would be invisible until a real agent tried to follow the instructions.
 */

import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import test from 'ava';
import {locateRepoRoot} from '../../utils.js';

const repoRoot = locateRepoRoot(fileURLToPath(import.meta.url));
const skillPath = path.join(repoRoot, 'skills', 'uxlint-review', 'SKILL.md');
const cliPath = path.join(repoRoot, 'source', 'cli.tsx');

const skill = fs.readFileSync(skillPath, 'utf8');
const cli = fs.readFileSync(cliPath, 'utf8');

test('the skill carries the frontmatter all three agents read', t => {
	// Verified against the installed CLIs: Claude Code, Codex and Cursor Agent
	// all load a local skill from a directory holding SKILL.md with this shape,
	// differing only in where that directory lives.
	t.regex(skill, /^---\n/, 'frontmatter opens the file');
	t.regex(skill, /\nname: uxlint-review\n/);
	t.regex(skill, /\ndescription: .+\n/);
});

test('every uxlint command the skill names exists in the CLI', t => {
	const named = new Set(
		[...skill.matchAll(/uxlint delegate ([-a-z]+)/g)].map(match => match[1]),
	);

	t.true(named.size > 0, 'the skill should name some commands');

	const missing = [...named].filter(
		verb => verb !== undefined && !new RegExp(`'${verb}'`).test(cli),
	);

	t.deepEqual(
		missing,
		[],
		'the skill names a command the CLI does not recognise, which fails at the agent’s first attempt',
	);
});

test('every flag the skill names exists in the CLI', t => {
	const named = new Set(
		[...skill.matchAll(/--([a-z][-a-z]*)/g)].map(match => match[1]),
	);

	// Meow turns `--host-agent` into the `hostAgent` flag, so the comparison is
	// against the camel-cased name the CLI declares.
	const declared = (flag: string) =>
		new RegExp(
			String.raw`\b` +
				flag.replaceAll(/-([a-z])/g, (_, letter: string) =>
					letter.toUpperCase(),
				) +
				':',
		).test(cli);

	const missing = [...named].filter(
		flag => flag !== undefined && !declared(flag),
	);

	t.deepEqual(missing, []);
});

test('the skill tells the agent not to claim provenance', t => {
	// The rule the whole report rests on. An agent that submits `origin` gets its
	// finding refused, so the skill has to say so before it tries.
	t.regex(skill, /origin/);
	t.regex(skill, /ruleId/);
	t.regex(skill, /affectedElements/);
});

test('the skill tells the agent to judge as the persona', t => {
	t.regex(skill, /persona/i);
});

test('the skill names the severities the intake accepts', t => {
	for (const severity of ['critical', 'high', 'medium', 'low']) {
		t.regex(skill, new RegExp(severity), `${severity} should be named`);
	}
});
