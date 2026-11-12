/**
 * `uxlint sign-in` through the built binary (011 T064).
 *
 * Run with every provider variable unset: the command reaches for no model,
 * so it must need no credential for one.
 */

import {spawnSync} from 'node:child_process';
import {promises as fsPromises} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import process from 'node:process';
import test from 'ava';

const cliPath = path.join(process.cwd(), 'dist', 'source', 'cli.js');
const neverSetSecret = 'UXLINT_TEST_SECRET_THAT_IS_NEVER_SET';

const providerPrefixes = [
	'UXLINT_',
	'ANTHROPIC_',
	'OPENAI_',
	'GOOGLE_',
	'XAI_',
	'OLLAMA_',
	'AWS_',
	'AZURE_',
];

const baseConfig = [
	'mainPageUrl: https://app.example.com/dashboard',
	'subPageUrls: []',
	'pages:',
	'  - url: https://app.example.com/dashboard',
	'    features: Usage at a glance',
	'persona: An operations lead',
	'report:',
	'  output: ./ux-report.md',
];

const signInBlock = [
	'signIn:',
	'  url: https://app.example.com/login',
	'  steps:',
	'    - fill: Email',
	'      value: qa@example.com',
	'    - fill: Password',
	`      secret: ${neverSetSecret}`,
	'    - click: Sign in',
	'  signedIn:',
	'    name: Sign out',
	'    role: button',
];

/**
 * Run the built CLI in a directory holding one configuration.
 */
async function runCli(
	teardown: (fn: () => Promise<void>) => void,
	args: string[],
	configLines: string[],
) {
	const work = await fsPromises.mkdtemp(path.join(tmpdir(), 'uxlint-cli-'));
	teardown(async () => fsPromises.rm(work, {recursive: true, force: true}));

	await fsPromises.writeFile(
		path.join(work, '.uxlintrc.yml'),
		configLines.join('\n'),
		'utf8',
	);

	const environment = Object.fromEntries(
		Object.entries(process.env).filter(([name]) =>
			providerPrefixes.every(prefix => !name.startsWith(prefix)),
		),
	);

	const result = spawnSync(process.execPath, [cliPath, ...args], {
		cwd: work,
		env: {...environment, LOG_DIRECTORY: path.join(work, 'logs')},
		encoding: 'utf8',
	});

	return {
		status: result.status,
		output: `${result.stdout}\n${result.stderr}`,
		work,
	};
}

test('sign-in with an unset secret says which one and exits 1, with no provider credential', async t => {
	const {status, output, work} = await runCli(
		t.teardown,
		['sign-in'],
		[...baseConfig, ...signInBlock],
	);

	t.is(status, 1);
	t.true(
		output.includes(
			`uxlint: Sign-in needs ${neverSetSecret}, which is not set in the environment`,
		),
	);
	await t.throwsAsync(fsPromises.stat(path.join(work, 'ux-report.md')));
});

test('sign-in on a configuration with no signIn block says so and exits 1', async t => {
	const {status, output} = await runCli(t.teardown, ['sign-in'], baseConfig);

	t.is(status, 1);
	t.true(output.includes('uxlint: this configuration has no signIn block'));
});

test('the usage text lists sign-in', async t => {
	const {output} = await runCli(t.teardown, ['--help'], baseConfig);

	t.true(
		output.split('\n').some(line => line.trimStart().startsWith('sign-in ')),
	);
});
