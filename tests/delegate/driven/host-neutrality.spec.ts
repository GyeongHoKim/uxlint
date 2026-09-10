/**
 * Host neutrality, asserted structurally.
 *
 * The agent-driven route's central claim is that no command behaves differently
 * according to which agent is calling it. Nothing about that shows up in a
 * behavioural test: a driven module that reached into `source/delegate/host/`
 * and branched on an adapter id would still pass every test of what the verbs
 * do. So the property is asserted the way `stdout-discipline.spec.ts` asserts
 * its own — by walking the import graph.
 *
 * 009 is why this exists. Its Cursor adapter declared a read-only posture,
 * passed every test that mentioned it, and had never worked. An unasserted
 * guarantee is the failure mode this project has already shipped once.
 */

import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import test from 'ava';
import {locateRepoRoot} from '../../utils.js';

const repoRoot = locateRepoRoot(fileURLToPath(import.meta.url));
const drivenRoot = path.join(repoRoot, 'source', 'delegate', 'driven');
const hostRoot = path.join(repoRoot, 'source', 'delegate', 'host');

/**
 * Every project-local module reachable from `entry` by following relative
 * imports.
 *
 * Read from the TypeScript sources rather than the compiled output, because the
 * rule this guards is about what a developer may write.
 *
 * @param entry - Absolute path to a TypeScript source file
 * @returns Absolute paths of every source file reachable from it
 */
function reachableSources(entry: string): string[] {
	const seen = new Set<string>();
	const queue = [entry];

	while (queue.length > 0) {
		const current = queue.pop()!;
		if (seen.has(current) || !fs.existsSync(current)) {
			continue;
		}

		seen.add(current);

		const source = fs.readFileSync(current, 'utf8');
		// Compiled ESM imports carry a .js suffix even from .ts sources, so the
		// specifier is rewritten back before it is resolved on disk.
		// Static, re-exporting, side-effect and dynamic imports alike, in either
		// quote style: a walker that saw only one form would let the others past.
		for (const match of source.matchAll(
			/\b(?:from|import)\s*(?:\(\s*)?["'](\.[^"']+)["']/g,
		)) {
			const specifier = match[1]!.replace(/\.js$/, '.ts');
			queue.push(path.resolve(path.dirname(current), specifier));
		}
	}

	return [...seen];
}

/**
 * Every TypeScript source directly under a directory tree.
 *
 * @param directory - Absolute path to walk
 * @returns Absolute paths of the .ts files found
 */
function sourcesUnder(directory: string): string[] {
	const found: string[] = [];

	for (const entry of fs.readdirSync(directory, {withFileTypes: true})) {
		const full = path.join(directory, entry.name);
		if (entry.isDirectory()) {
			found.push(...sourcesUnder(full));
		} else if (full.endsWith('.ts')) {
			found.push(full);
		}
	}

	return found;
}

test('the driven route has modules to assert about', t => {
	t.true(fs.existsSync(drivenRoot), `${drivenRoot} should exist`);
	t.true(
		sourcesUnder(drivenRoot).length > 0,
		'the driven directory should hold at least one module',
	);
});

test('no driven module can reach a host adapter', t => {
	const offenders: string[] = [];

	for (const entry of sourcesUnder(drivenRoot)) {
		const reached = reachableSources(entry).filter(file =>
			file.startsWith(hostRoot + path.sep),
		);

		if (reached.length > 0) {
			offenders.push(
				`${path.relative(repoRoot, entry)} → ${reached
					.map(file => path.relative(repoRoot, file))
					.join(', ')}`,
			);
		}
	}

	t.deepEqual(
		offenders,
		[],
		'a driven module reaching source/delegate/host/ can branch on which agent is calling, which is exactly what this route must not do',
	);
});

test('no driven module names a supported agent', t => {
	// The stronger form of the same rule. An adapter can be avoided and the
	// branch written by hand against a string, which the import check alone
	// would not see.
	const offenders: string[] = [];

	for (const entry of sourcesUnder(drivenRoot)) {
		const source = fs.readFileSync(entry, 'utf8');
		// Only code lines: the package documentation explains the route by
		// naming the agents, and explaining is the opposite of branching.
		const code = source
			.split('\n')
			.filter(line => !/^\s*(?:\*|\/\/|\/\*)/.test(line))
			.join('\n');

		if (/(["'`])(?:claude-code|codex|cursor-agent)\1/.test(code)) {
			offenders.push(path.relative(repoRoot, entry));
		}
	}

	t.deepEqual(offenders, []);
});
