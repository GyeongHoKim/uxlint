import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import test from 'ava';
import {locateRepoRoot} from '../utils.js';

/**
 * Every project-local module reachable from `entry` by following relative
 * imports.
 *
 * Read from the TypeScript sources rather than from the compiled output,
 * because the rule this guards is about what a developer may write. Package
 * imports are not followed: the concern is this project's own stdout, and the
 * server SDK owns the stream deliberately.
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
		for (const match of source.matchAll(/from\s+'(\.[^']+)'/g)) {
			const specifier = match[1]!.replace(/\.js$/, '.ts');
			queue.push(path.resolve(path.dirname(current), specifier));
		}
	}

	return [...seen];
}

const repoRoot = locateRepoRoot(fileURLToPath(import.meta.url));
const forbidden = path.join(
	repoRoot,
	'source',
	'infrastructure',
	'console-output.ts',
);

// The judgement server's stdout carries JSON-RPC. This is the first place in
// the project where uxlint's own stdout is a protocol stream rather than
// merely a stream reserved against a child's transport, so the sanctioned
// exception for terminating messages does not apply inside it at all.
test('console-output.ts is unreachable from the judgement server', t => {
	const entry = path.join(repoRoot, 'source', 'delegate', 'mcp-server.ts');
	t.true(fs.existsSync(entry), `${entry} should exist`);

	const reachable = reachableSources(entry);

	t.false(
		reachable.includes(forbidden),
		`console-output.ts is reachable from the judgement server via ${reachable
			.filter(file => file.includes('delegate'))
			.join(', ')}`,
	);
});

test('console-output.ts is unreachable from every module the server pulls in', t => {
	const entry = path.join(repoRoot, 'source', 'delegate', 'mcp-server.ts');
	const offenders = reachableSources(entry).filter(file =>
		fs.readFileSync(file, 'utf8').includes('console-output.js'),
	);

	t.deepEqual(offenders, []);
});
