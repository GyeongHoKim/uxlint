/**
 * Default page-bound calibration against measured baselines
 * (008 T013 · SC-004 · Constitution IV).
 *
 * The shipped default must leave at least 10x headroom over the healthy page
 * durations recorded in this feature's baseline -- numbers captured from the
 * scripted harness, not invented. The assertion reads the recorded file so a
 * recalibrated baseline that invalidates the default fails HERE instead of
 * silently stranding users whose healthy pages start tripping the bound.
 */

import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import test from 'ava';
import {defaultPageTimeLimitMs} from '../../source/models/config.js';
import {locateRepoRoot} from '../utils.js';

const moduleDirectory = path.dirname(fileURLToPath(import.meta.url));
const baselineDir = path.join(
	locateRepoRoot(moduleDirectory),
	'specs',
	'008-sdk-agent-loop',
);

const casesPath = path.join(baselineDir, 'baseline', 'cases.json');
const rawCases = fs.readFileSync(casesPath, 'utf8');
const cases = JSON.parse(rawCases) as Record<
	string,
	{wallClockMs: number; requests: number}
>;

test('the shipped default bound leaves >=10x headroom over observed healthy pages', t => {
	const healthy = ['happy-path', 'budget-exhaustion', 'failed-navigation'].map(
		name => cases[name]?.wallClockMs ?? 0,
	);
	const observedMax = Math.max(...healthy);

	t.true(
		defaultPageTimeLimitMs >= observedMax * 10,
		`default ${defaultPageTimeLimitMs} ms is under 10x the observed healthy maximum ${observedMax} ms`,
	);

	t.log(
		`observed healthy max: ${observedMax} ms; headroom: ${(
			defaultPageTimeLimitMs / observedMax
		).toFixed(0)}x`,
	);
});

test('the mid-run-failure timing is excluded from headroom math', t => {
	// That figure measures provider retries under an injected outage, not a
	// healthy page; including it would flatter whatever default was chosen.
	t.true(cases['mid-run-failure']!.wallClockMs > 1000);
});
