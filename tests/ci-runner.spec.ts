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
import {ReportBuilder} from '../source/services/report-builder.js';

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
			async getAIService() {
				return aiService as never;
			},
			reportBuilder: builder,
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
		async getAIService() {
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
		async getAIService() {
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

			return service as never;
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
		async getAIService() {
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

			return service as never;
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
		async getAIService() {
			const service = {
				async analyzePage() {
					throw new Error('transport died mid-run');
				},
				async close() {
					closed = true;
				},
			};

			return service as never;
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
		async getAIService() {
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

			return service as never;
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
		async getAIService() {
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
		async getAIService() {
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
		async getAIService() {
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
