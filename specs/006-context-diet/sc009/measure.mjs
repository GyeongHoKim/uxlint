/**
 * Read per-page finding counts out of a generated report.
 *
 * Parses the rendered markdown rather than the in-memory report, because the
 * markdown is what a run leaves behind and what a person compares. The count
 * is stated per page by the generator, so it is read rather than recomputed.
 */
import {readFileSync} from 'node:fs';
import process from 'node:process';

const text = readFileSync(process.argv[2], 'utf8');
const perPage = [...text.matchAll(/^\*\*Findings\*\*: (\d+) issues identified$/gm)].map(
	match => Number(match[1]),
);

const sorted = [...perPage].sort((a, b) => a - b);
const middle = Math.floor(sorted.length / 2);
const median =
	sorted.length === 0
		? 0
		: sorted.length % 2 === 0
			? (sorted[middle - 1] + sorted[middle]) / 2
			: sorted[middle];

console.log(JSON.stringify({pages: perPage.length, perPage, median}));
