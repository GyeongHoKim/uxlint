/**
 * Unit tests for the CI runner's exit status
 *
 * `runCIAnalysis` resolves to the exit code and leaves the exit to its caller,
 * which is what lets these assertions run without killing the test process.
 */

import {promises as fsPromises} from 'node:fs';
import process from 'node:process';
import test from 'ava';
import sinon from 'sinon';
import {runCIAnalysis} from '../source/ci-runner.js';
import type {PageAnalysis} from '../source/models/analysis.js';
import type {PreflightVerdict} from '../source/models/browser-preflight.js';
import type {UxLintConfig} from '../source/models/config.js';
import {
	describeSignInFailure,
	missingSecretText,
	type SignInDescription,
	type SignInFailure,
} from '../source/models/sign-in.js';
import {ReportBuilder} from '../source/services/report-builder.js';
import type {SignedInSession} from '../source/services/sign-in.js';

const baseConfig = (overrides: Partial<UxLintConfig> = {}): UxLintConfig => ({
	mainPageUrl: 'https://example.com',
	subPageUrls: [],
	pages: [{url: 'https://example.com', features: 'features'}],
	persona: 'Test persona',
	report: {output: './test-report.md'},
	...overrides,
});

/**
 * A stand-in for AIService that records one analysis per page without
 * touching a model or a browser.
 */
const stubAiService = (
	builder: ReportBuilder,
	behaviour: (page: {url: string; features: string}) => PageAnalysis,
) => ({
	async analyzePage(
		_config: UxLintConfig,
		page: {url: string; features: string},
	) {
		return behaviour(page);
	},
	async close() {
		// No transport to close
	},
	builder,
});

const completed =
	(builder: ReportBuilder) => (page: {url: string; features: string}) => {
		builder.initializePageAnalysis(page.url, page.features);
		return builder.completePageAnalysis();
	};

const createDeps = (
	behaviour?: (
		builder: ReportBuilder,
	) => (page: {url: string; features: string}) => PageAnalysis,
) => {
	const sandbox = sinon.createSandbox();
	const builder = new ReportBuilder({
		...fsPromises,
		writeFile: sandbox.stub().resolves(),
	});
	const aiService = stubAiService(builder, (behaviour ?? completed)(builder));

	return {
		sandbox,
		builder,
		deps: {
			async createRun() {
				return {aiService: aiService as never, reportBuilder: builder};
			},
			// Preflight is stubbed ready so these tests exercise the analysis
			// path rather than the environment. The real probe spawns a browser,
			// which no unit test should depend on.
			async runPreflight() {
				return readyVerdict;
			},
		},
	};
};

const readyVerdict: PreflightVerdict = {
	kind: 'ready',
	browser: {
		executablePath: '/opt/google/chrome/chrome',
		version: 'Google Chrome 151.0.7922.137',
		majorVersion: 151,
	},
};

test('resolves to 0 when analysis completes', async t => {
	const {sandbox, deps} = createDeps();

	const code = await runCIAnalysis(baseConfig(), deps);

	t.is(code, 0, 'a completed run must not fail the pipeline');
	sandbox.restore();
});

test('resolves to 1 when analysis throws', async t => {
	const {sandbox, deps} = createDeps();
	const failing = {
		...deps,
		async createRun() {
			throw new Error('MCP client unavailable');
		},
	};

	const code = await runCIAnalysis(baseConfig(), failing);

	t.is(code, 1);
	sandbox.restore();
});

test('resolves rather than exiting the process', async t => {
	const {sandbox, deps} = createDeps();
	const exit = sandbox.stub(process, 'exit');

	await runCIAnalysis(baseConfig(), deps);

	t.false(
		exit.called,
		'the runner must return its verdict, not terminate the process',
	);
	sandbox.restore();
});

test('resolves to 0 with findings present and no thresholds configured', async t => {
	// SC-004: existing pipelines must not start failing on upgrade.
	const {sandbox, deps, builder} = createDeps(b => page => {
		b.initializePageAnalysis(page.url, page.features);
		b.addFinding({
			severity: 'critical',
			category: 'Accessibility',
			description: 'Critical issue',
			personaRelevance: ['Test persona'],
			recommendation: 'Fix it',
			pageUrl: page.url,
			origin: 'judgement',
		});
		return b.completePageAnalysis();
	});

	const code = await runCIAnalysis(baseConfig(), deps);

	t.is(builder.generateFinalReport().metadata.totalFindings, 1);
	t.is(code, 0, 'findings alone must not fail a run with no thresholds');
	sandbox.restore();
});

test('writes the report before returning', async t => {
	const {sandbox, deps, builder} = createDeps();
	const saveReport = sandbox.spy(builder, 'saveReport');

	await runCIAnalysis(baseConfig(), deps);

	t.true(
		saveReport.calledOnce,
		'a failing gate must not cost the user the artifact that explains it',
	);
	sandbox.restore();
});

test('a breached threshold fails the run', async t => {
	const {sandbox, deps} = createDeps(b => page => {
		b.initializePageAnalysis(page.url, page.features);
		b.addFinding({
			severity: 'critical',
			category: 'Accessibility',
			description: 'Critical issue',
			personaRelevance: ['Test persona'],
			recommendation: 'Fix it',
			pageUrl: page.url,
			origin: 'judgement',
		});
		return b.completePageAnalysis();
	});
	const emitted: string[] = [];

	const code = await runCIAnalysis(baseConfig({thresholds: {maxCritical: 0}}), {
		...deps,
		emitVerdict(verdict) {
			emitted.push(verdict);
		},
	});

	t.is(code, 1);
	t.regex(emitted.join('\n'), /gate failed/);
	t.regex(emitted.join('\n'), /critical\s+1 findings, limit 0/);
	sandbox.restore();
});

test('a threshold that holds passes the run and still reports', async t => {
	const {sandbox, deps} = createDeps();
	const emitted: string[] = [];

	const code = await runCIAnalysis(baseConfig({thresholds: {maxCritical: 0}}), {
		...deps,
		emitVerdict(verdict) {
			emitted.push(verdict);
		},
	});

	t.is(code, 0);
	t.regex(emitted.join('\n'), /gate passed/);
	sandbox.restore();
});

test('no verdict is emitted when nothing was gated', async t => {
	const {sandbox, deps} = createDeps();
	const emitted: string[] = [];

	await runCIAnalysis(baseConfig(), {
		...deps,
		emitVerdict(verdict) {
			emitted.push(verdict);
		},
	});

	t.deepEqual(
		emitted,
		[],
		'printing a summary with no thresholds would imply a gate that does not exist',
	);
	sandbox.restore();
});

test('the report is saved and the transport closed before the verdict is emitted', async t => {
	// MCP protocol messages share stdout while the transport is open, so
	// emitting the verdict any earlier interleaves program output with
	// JSON-RPC. The ordering is a constraint, not a preference.
	const {sandbox, builder, deps} = createDeps();
	const order: string[] = [];

	sandbox.stub(builder, 'saveReport').callsFake(async () => {
		order.push('saveReport');
	});

	const closingDeps = {
		...deps,
		async createRun() {
			const service = {
				async analyzePage(
					_config: UxLintConfig,
					page: {url: string; features: string},
				) {
					builder.initializePageAnalysis(page.url, page.features);
					return builder.completePageAnalysis();
				},
				async close() {
					order.push('close');
				},
			};

			return {aiService: service as never, reportBuilder: builder};
		},
		emitVerdict() {
			order.push('emitVerdict');
		},
	};

	await runCIAnalysis(baseConfig({thresholds: {maxCritical: 0}}), closingDeps);

	t.deepEqual(order, ['saveReport', 'close', 'emitVerdict']);
	sandbox.restore();
});

/**
 * SC-004: adding this feature must not change the exit status of any config
 * that has no thresholds block. The baseline recorded in
 * specs/004-ci-gate/baseline.md says every completed run exited 0 regardless
 * of findings, and a run that threw exited 1. These pin exactly that.
 */
test('SC-004: a clean run with no thresholds still exits 0', async t => {
	const {sandbox, deps} = createDeps();

	t.is(await runCIAnalysis(baseConfig(), deps), 0);
	sandbox.restore();
});

test('SC-004: a run full of critical findings and no thresholds still exits 0', async t => {
	const {sandbox, deps} = createDeps(b => page => {
		b.initializePageAnalysis(page.url, page.features);
		for (let index = 0; index < 20; index++) {
			b.addFinding({
				severity: 'critical',
				category: 'Accessibility',
				description: `Critical issue ${index}`,
				personaRelevance: ['Test persona'],
				recommendation: 'Fix it',
				pageUrl: page.url,
				origin: 'judgement',
			});
		}

		return b.completePageAnalysis();
	});

	t.is(
		await runCIAnalysis(baseConfig(), deps),
		0,
		'twenty critical findings must not fail a pipeline that never opted in',
	);
	sandbox.restore();
});

test('SC-004: a failed page with no thresholds still exits 0', async t => {
	const {sandbox, deps} = createDeps(b => page => {
		b.initializePageAnalysis(page.url, page.features);
		return b.failCurrentPage('navigation timed out', {
			url: page.url,
			features: page.features,
		});
	});

	t.is(await runCIAnalysis(baseConfig(), deps), 0);
	sandbox.restore();
});

test('the AI service is closed even when saving the report throws', async t => {
	// A transport and a browser are live by this point; both must be released.
	const {sandbox, builder, deps} = createDeps();
	let closed = false;

	sandbox.stub(builder, 'saveReport').rejects(new Error('disk full'));

	const leakyDeps = {
		...deps,
		async createRun() {
			const service = {
				async analyzePage(
					_config: UxLintConfig,
					page: {url: string; features: string},
				) {
					builder.initializePageAnalysis(page.url, page.features);
					return builder.completePageAnalysis();
				},
				async close() {
					closed = true;
				},
			};

			return {aiService: service as never, reportBuilder: builder};
		},
	};

	const code = await runCIAnalysis(baseConfig(), leakyDeps);

	t.is(code, 1);
	t.true(closed, 'a failure after the transport opened must still close it');
	sandbox.restore();
});

test('the AI service is closed when a page analysis throws', async t => {
	const {sandbox, builder, deps} = createDeps();
	let closed = false;

	const throwingDeps = {
		...deps,
		async createRun() {
			const service = {
				async analyzePage() {
					throw new Error('transport died mid-run');
				},
				async close() {
					closed = true;
				},
			};

			return {aiService: service as never, reportBuilder: builder};
		},
		reportBuilder: builder,
	};

	t.is(await runCIAnalysis(baseConfig(), throwingDeps), 1);
	t.true(closed);
	sandbox.restore();
});

test('a close that throws does not trigger a second close', async t => {
	// A rejecting close() must still leave a resolved exit code, and must not
	// be retried against a torn-down instance.
	const {sandbox, builder, deps} = createDeps();
	let closeCalls = 0;

	const failingCloseDeps = {
		...deps,
		async createRun() {
			const service = {
				async analyzePage(
					_config: UxLintConfig,
					page: {url: string; features: string},
				) {
					builder.initializePageAnalysis(page.url, page.features);
					return builder.completePageAnalysis();
				},
				async close() {
					closeCalls++;
					throw new Error('transport refused to shut down');
				},
			};

			return {aiService: service as never, reportBuilder: builder};
		},
		emitVerdict() {
			// Swallowed: the assertion is about close(), not the message.
		},
	};

	const code = await runCIAnalysis(baseConfig(), failingCloseDeps);

	t.is(closeCalls, 1, 'close must not be attempted twice');
	t.is(code, 1, 'the failure must stay a resolved exit code, not a rejection');
	sandbox.restore();
});

test('an analysis failure reports its reason, not just an exit code', async t => {
	// The likeliest CI failure is the analysis throwing; an exit code alone
	// leaves the developer nothing to act on.
	const {sandbox, deps} = createDeps();
	const emitted: string[] = [];

	const code = await runCIAnalysis(baseConfig(), {
		...deps,
		async createRun() {
			throw new Error('MCP client unavailable');
		},
		emitVerdict(verdict) {
			emitted.push(verdict);
		},
	});

	t.is(code, 1);
	t.regex(emitted.join('\n'), /MCP client unavailable/);
	sandbox.restore();
});

test('an unmet preflight exits non-zero without ever reaching the model', async t => {
	const {sandbox, deps} = createDeps();
	let aiServiceCalls = 0;

	const noBrowser = {
		...deps,
		async createRun() {
			aiServiceCalls++;
			throw new Error('the model must never be reached');
		},
		async runPreflight() {
			const verdict: PreflightVerdict = {
				kind: 'unmet',
				requirement: {
					kind: 'browser-absent',
					searchedPaths: ['/opt/google/chrome/chrome'],
				},
			};
			return verdict;
		},
	};

	const code = await runCIAnalysis(baseConfig(), noBrowser);

	t.is(code, 1);
	t.is(
		aiServiceCalls,
		0,
		'preflight must fail before any model usage is incurred',
	);
	sandbox.restore();
});

test('an unmet preflight names the missing browser in the emitted message', async t => {
	const {sandbox, deps} = createDeps();
	const emitted: string[] = [];

	const noBrowser = {
		...deps,
		emitVerdict(verdict: string) {
			emitted.push(verdict);
		},
		async runPreflight() {
			const verdict: PreflightVerdict = {
				kind: 'unmet',
				requirement: {
					kind: 'browser-absent',
					searchedPaths: ['/opt/google/chrome/chrome'],
				},
			};
			return verdict;
		},
	};

	await runCIAnalysis(baseConfig(), noBrowser);

	// The pipeline owner reads only this. It has to carry the remedy.
	t.true(
		emitted.some(message => message.includes('/opt/google/chrome/chrome')),
	);
	t.true(emitted.some(message => /install/i.test(message)));
	sandbox.restore();
});

test('a relaxed sandbox is disclosed rather than applied silently', async t => {
	const {sandbox, deps} = createDeps();
	const emitted: string[] = [];

	const relaxed = {
		...deps,
		emitVerdict(verdict: string) {
			emitted.push(verdict);
		},
		async runPreflight() {
			const verdict: PreflightVerdict = {
				kind: 'ready-without-sandbox',
				browser: {
					executablePath: '/opt/google/chrome/chrome',
					version: 'Google Chrome 151.0.7922.137',
					majorVersion: 151,
				},
				cause: 'Running as root without --no-sandbox is not supported.',
			};
			return verdict;
		},
	};

	const code = await runCIAnalysis(baseConfig(), relaxed);

	t.is(code, 0, 'the run still proceeds');
	t.true(emitted.some(message => message.includes('Sandbox relaxation')));
	sandbox.restore();
});

test('a report records what produced it', async t => {
	const {sandbox, builder, deps} = createDeps();

	await runCIAnalysis(baseConfig(), deps);

	const report = builder.generateFinalReport();
	t.is(report.metadata.tooling.browserServer, 'chrome-devtools-mcp');
	t.is(report.metadata.tooling.browserVersion, 'Google Chrome 151.0.7922.137');
	t.false(report.metadata.tooling.externalDataAllowed);
	sandbox.restore();
});

test('a preflight that throws exits 1 with a message about the environment', async t => {
	const {sandbox, deps} = createDeps();
	let aiServiceCalls = 0;
	const emitted: string[] = [];

	const throwing = {
		...deps,
		async createRun() {
			aiServiceCalls++;
			throw new Error('the model must never be reached');
		},
		emitVerdict(verdict: string) {
			emitted.push(verdict);
		},
		async runPreflight(): Promise<PreflightVerdict> {
			// A read-only or full /tmp makes the probe's temporary profile
			// directory throw. Left unguarded this rejects out of the runner and
			// the user gets a bare message that never mentions a browser.
			throw new Error('EROFS: read-only file system, mkdtemp');
		},
	};

	const code = await runCIAnalysis(baseConfig(), throwing);

	t.is(code, 1);
	t.is(aiServiceCalls, 0, 'a failed preflight must still cost no model usage');
	t.true(emitted.some(message => message.includes('preflight')));
	t.true(emitted.some(message => message.includes('EROFS')));
	sandbox.restore();
});

/**
 * Signing in (011). A run whose configuration describes a sign-in carries a
 * session, and the runner establishes it once before any page is analysed.
 * A run without one must be left exactly as it was.
 */
const signIn: SignInDescription = {
	url: 'https://example.com/login',
	steps: [{fill: 'Email', value: 'reviewer@example.com'}, {click: 'Sign in'}],
	signedIn: {name: 'Account menu', role: 'button'},
};

const threePages = (overrides: Partial<UxLintConfig> = {}): UxLintConfig =>
	baseConfig({
		subPageUrls: ['https://example.com/billing', 'https://example.com/team'],
		pages: [
			{url: 'https://example.com', features: 'Overview'},
			{url: 'https://example.com/billing', features: 'Invoices'},
			{url: 'https://example.com/team', features: 'Members'},
		],
		...overrides,
	});

/**
 * `createDeps` with a session on the run. The session signs in without a
 * browser, and `order` records it against each page analysis so a test can
 * assert which came first.
 */
const createSignedInDeps = () => {
	const order: string[] = [];
	const {sandbox, builder, deps} = createDeps(b => page => {
		order.push(`analyse ${page.url}`);
		return completed(b)(page);
	});
	const establish = sandbox.stub().callsFake(async () => {
		order.push('establish');
		return {kind: 'signed-in'};
	});
	const session = {
		establish,
		redact: (text: string) => text,
	} as unknown as SignedInSession;

	return {
		sandbox,
		builder,
		establish,
		order,
		deps: {
			...deps,
			async createRun() {
				const run = await deps.createRun();
				return {...run, session};
			},
		},
	};
};

test('a run with a session signs in once, before the first page is analysed', async t => {
	// One sign-in serves the whole run: the pages share a browser, so signing
	// in again per page would only repeat work the first one already did.
	const {sandbox, establish, order, deps} = createSignedInDeps();

	const code = await runCIAnalysis(threePages({signIn}), deps);

	t.is(code, 0);
	t.is(establish.callCount, 1, 'three pages must cost exactly one sign-in');
	t.deepEqual(order, [
		'establish',
		'analyse https://example.com',
		'analyse https://example.com/billing',
		'analyse https://example.com/team',
	]);
	sandbox.restore();
});

test('a run that signed in says so in its report', async t => {
	const {sandbox, builder, deps} = createSignedInDeps();

	await runCIAnalysis(baseConfig({signIn}), deps);

	const {tooling} = builder.generateFinalReport().metadata;
	t.true(
		tooling.signedIn,
		'a reader of the report must be able to tell the pages were reviewed signed in',
	);
	// Signing in adds to the provenance; it must not replace what was there.
	t.is(tooling.browserServer, 'chrome-devtools-mcp');
	sandbox.restore();
});

test('a run with no session records nothing about signing in', async t => {
	// A configuration without `signIn` is every configuration that existed
	// before this feature. `signedIn: false` would claim a sign-in was
	// attempted and failed, so the key has to be absent, not falsy.
	const {sandbox, builder, deps} = createDeps();

	const code = await runCIAnalysis(threePages(), deps);

	const {metadata} = builder.generateFinalReport();
	t.is(code, 0);
	t.false('signedIn' in metadata.tooling);
	t.is(metadata.analyzedPages.length, 3);
	sandbox.restore();
});

/**
 * A failed sign-in (011, FR-009). No page is reviewed, but the run still
 * leaves a report: every configured page is recorded as failed with the
 * reason, so a reader is not left with a pipeline that failed and nothing
 * that says which pages went unreviewed or why.
 */
const rejected: SignInFailure = {
	kind: 'sign-absent',
	shown:
		'"Sign in" at https://example.com/login?error=1 — alert: "Invalid email or password"',
};

const rejectedReason = describeSignInFailure(rejected, signIn);

/**
 * `createDeps` with a session whose sign-in fails. Everything the run did
 * afterwards is recorded, because what is being asserted is mostly what it
 * must not do.
 */
const createFailedSignInDeps = () => {
	const {sandbox, builder, deps} = createDeps();
	const analysed: string[] = [];
	const emitted: string[] = [];
	let closeCalls = 0;
	const saveReport = sandbox.spy(builder, 'saveReport');
	const session = {
		establish: sandbox.stub().resolves({kind: 'failed', failure: rejected}),
		redact: (text: string) => text,
	} as unknown as SignedInSession;

	return {
		sandbox,
		builder,
		saveReport,
		analysed,
		emitted,
		closeCalls: () => closeCalls,
		deps: {
			...deps,
			async createRun() {
				const service = {
					async analyzePage(
						_config: UxLintConfig,
						page: {url: string; features: string},
					) {
						analysed.push(page.url);
						return completed(builder)(page);
					},
					async close() {
						closeCalls++;
					},
				};

				return {
					aiService: service as never,
					reportBuilder: builder,
					session,
				};
			},
			emitVerdict(verdict: string) {
				emitted.push(verdict);
			},
		},
	};
};

test('a failed sign-in analyses no page and records every page as failed for that reason', async t => {
	const {sandbox, builder, saveReport, analysed, deps} =
		createFailedSignInDeps();

	await runCIAnalysis(threePages({signIn}), deps);

	t.deepEqual(analysed, [], 'a page must not be reviewed signed out');
	t.true(
		saveReport.calledOnceWith('./test-report.md'),
		'the report is the only place the unreviewed pages are listed',
	);

	const report = builder.generateFinalReport();
	t.deepEqual(report.metadata.failedPages, [
		'https://example.com',
		'https://example.com/billing',
		'https://example.com/team',
	]);
	t.deepEqual(report.metadata.analyzedPages, []);
	t.deepEqual(
		report.pages.map(page => page.error),
		[rejectedReason, rejectedReason, rejectedReason],
	);
	// False rather than absent: a sign-in was described, attempted, and failed.
	t.false(report.metadata.tooling.signedIn);
	// The failure adds to the provenance; it must not replace what was there.
	t.is(report.metadata.tooling.browserServer, 'chrome-devtools-mcp');
	sandbox.restore();
});

// Written for both because the gate must not be what decides it: a failed
// sign-in fails a pipeline that never configured a threshold, and a configured
// one must not turn the message into a verdict about findings.
for (const [label, thresholds] of [
	['with no thresholds configured', undefined],
	['with thresholds configured', {maxCritical: 10}],
] as const) {
	test(`a failed sign-in exits 1 and says why ${label}`, async t => {
		const {sandbox, emitted, closeCalls, deps} = createFailedSignInDeps();

		const code = await runCIAnalysis(
			threePages({signIn, ...(thresholds && {thresholds})}),
			deps,
		);

		t.is(code, 1);
		t.true(
			emitted.includes(`uxlint: sign-in failed — ${rejectedReason}`),
			'the message names the sign-in, not a failed analysis',
		);
		t.false(emitted.some(message => message.includes('analysis failed')));
		t.is(closeCalls(), 1, 'the browser is released on this path too');
		sandbox.restore();
	});
}

/**
 * A missing secret (011, FR-010). Found out before anything is started, so a
 * pipeline that forgot to set one is told at once and has spent nothing.
 */
const neverSetSecret = 'UXLINT_TEST_SECRET_THAT_IS_NEVER_SET';

test('a sign-in naming a secret that is not set stops the run before anything is started', async t => {
	Reflect.deleteProperty(process.env, neverSetSecret);
	const {sandbox, builder, deps} = createSignedInDeps();
	const saveReport = sandbox.spy(builder, 'saveReport');
	const emitted: string[] = [];
	let preflightCalls = 0;
	let runsCreated = 0;

	const code = await runCIAnalysis(
		baseConfig({
			signIn: {
				...signIn,
				steps: [
					{fill: 'Email', value: 'reviewer@example.com'},
					{fill: 'Password', secret: neverSetSecret},
					{click: 'Sign in'},
				],
			},
		}),
		{
			async createRun() {
				runsCreated++;
				return deps.createRun();
			},
			async runPreflight() {
				preflightCalls++;
				return readyVerdict;
			},
			emitVerdict(verdict) {
				emitted.push(verdict);
			},
		},
	);

	t.is(code, 1);
	t.deepEqual(emitted, [`uxlint: ${missingSecretText([neverSetSecret])}`]);
	t.is(
		emitted[0],
		`uxlint: Sign-in needs ${neverSetSecret}, which is not set in the environment`,
	);
	t.is(preflightCalls, 0, 'no browser is probed for a run that cannot sign in');
	t.is(runsCreated, 0, 'no run is assembled, so no model is reached');
	t.false(saveReport.called, 'nothing was reviewed, so nothing is reported');
	sandbox.restore();
});
