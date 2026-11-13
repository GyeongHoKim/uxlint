/**
 * The capture pass when a run is signed in (011 T019 · FR-008, FR-011, FR-012).
 *
 * The delegate routes open and capture each page themselves, so the session is
 * asked directly after the capture. A page it refuses is not a page that was
 * partly reviewed: nothing of it goes to a host agent, and it is closed as
 * failed with the session's reason.
 */

import {promises as fsPromises} from 'node:fs';
import test from 'ava';
import sinon from 'sinon';
import {
	assembleReport,
	captureAllPages,
	capturePage,
	type CapturedPage,
} from '../../source/delegate/capture-pass.js';
import type {Page} from '../../source/models/config.js';
import {noMeasurement} from '../../source/models/measurement.js';
import type {PageAdmission} from '../../source/models/sign-in.js';
import type {MeasurementService} from '../../source/services/measurement.js';
import {ReportBuilder} from '../../source/services/report-builder.js';
import type {SignedInSession} from '../../source/services/sign-in.js';
import {mcpError} from '../fixtures/mcp-result.js';
import {scriptedBrowser, structure} from '../fixtures/sign-in-browser.js';

const origin = 'https://app.example.com';

const page = (path: string): Page => ({
	url: `${origin}${path}`,
	features: `features of ${path}`,
});

const loginForm = structure('Sign in', `${origin}/login`, [
	'textbox "Email "',
	'button "Sign in"',
]);

const dashboard = structure('Dashboard', `${origin}/dashboard`, [
	'button "Sign out"',
	'heading "Dashboard" level="1"',
]);

/** What the session returns in place of a capture it admits. */
const admittedDashboard = dashboard.replace(
	'Dashboard',
	'Dashboard [admitted]',
);

const refusalDetail =
	'The session was lost and signing in again failed: Sign-in did not finish within 30000 ms';

/** A session whose admission decisions are scripted, one per capture. */
const sessionDeciding = (...decisions: PageAdmission[]) => {
	const admit = sinon.stub();
	for (const [index, decision] of decisions.entries()) {
		admit.onCall(index).resolves(decision);
	}

	return {
		admit,
		session: {
			admit,
			establish: sinon.stub().resolves({kind: 'signed-in'}),
			redact: (text: string) => text,
		} as unknown as SignedInSession,
	};
};

const admitted: PageAdmission = {
	kind: 'admitted',
	snapshot: admittedDashboard,
};

const refused: PageAdmission = {
	kind: 'refused',
	reason: 'session-lost',
	detail: refusalDetail,
};

// --- capturePage ------------------------------------------------------------

test('the session is asked about the capture, for the configured address', async t => {
	const {client} = scriptedBrowser({snapshot: () => dashboard});
	const {admit, session} = sessionDeciding(admitted);

	await capturePage(client, page('/dashboard'), session);

	t.is(admit.callCount, 1);
	t.deepEqual(admit.firstCall.args, [`${origin}/dashboard`, dashboard]);
});

test('an admitted page yields the capture the session admitted', async t => {
	const {client} = scriptedBrowser({snapshot: () => dashboard});
	const {session} = sessionDeciding(admitted);

	const result = await capturePage(client, page('/dashboard'), session);

	t.deepEqual(result, {snapshot: admittedDashboard, stage: 'analysable'});
});

test('an admitted page carries the address it was reached at when that differs', async t => {
	const {client} = scriptedBrowser({snapshot: () => dashboard});
	const {session} = sessionDeciding({
		...admitted,
		reachedUrl: `${origin}/dashboard`,
	});

	const result = await capturePage(client, page('/home'), session);

	t.is(result.reachedUrl, `${origin}/dashboard`);
	t.is(result.notReached, undefined);
});

test('a refused page yields nothing to review and says why', async t => {
	const {client} = scriptedBrowser({snapshot: () => loginForm});
	const {session} = sessionDeciding(refused);

	const result = await capturePage(client, page('/billing'), session);

	t.is(result.snapshot, '');
	t.is(result.failureReason, refusalDetail);
	t.is(result.notReached, 'session-lost');
	t.not(
		result.stage,
		'analysable',
		'a refused page must not count as a page that was read',
	);
});

test('a page that could not be opened is not put to the session', async t => {
	const {client} = scriptedBrowser({
		snapshot: () => dashboard,
		onNavigate: () => mcpError('net::ERR_NAME_NOT_RESOLVED'),
	});
	const {admit, session} = sessionDeciding(admitted);

	const result = await capturePage(client, page('/dashboard'), session);

	t.is(admit.callCount, 0);
	t.regex(result.failureReason ?? '', /could not be opened/);
	t.is(result.notReached, undefined);
});

test('without a session a capture is returned as the browser gave it', async t => {
	// FR-023: the login form is a page like any other to a run that never
	// said it would sign in.
	const {client} = scriptedBrowser({snapshot: () => loginForm});

	const result = await capturePage(client, page('/login'));

	t.deepEqual(result, {snapshot: loginForm, stage: 'analysable'});
});

test('without a session a page that forwards elsewhere says where it was captured', async t => {
	// FR-014: every run reports a redirect, signed in or not, and changes
	// nothing else about the page because of it.
	const {client} = scriptedBrowser({snapshot: () => dashboard});

	const result = await capturePage(client, page('/home'));

	t.deepEqual(result, {
		snapshot: dashboard,
		stage: 'analysable',
		reachedUrl: `${origin}/dashboard`,
	});
});

test('without a session a trailing slash is not a different address', async t => {
	const {client} = scriptedBrowser({snapshot: () => dashboard});

	const result = await capturePage(client, page('/dashboard/'));

	t.false(Object.hasOwn(result, 'reachedUrl'));
});

// --- captureAllPages --------------------------------------------------------

test('a refused page is not measured, and the pages around it are', async t => {
	const {client} = scriptedBrowser({snapshot: () => dashboard});
	const {session} = sessionDeciding(admitted, refused, admitted);
	const measure = sinon.stub().resolves(noMeasurement('page-not-loaded'));

	const captured = await captureAllPages(
		client,
		{measure} as unknown as MeasurementService,
		[page('/dashboard'), page('/billing'), page('/settings')],
		{session},
	);

	t.deepEqual(
		measure.getCalls().map(call => call.args[0] === 'analysable'),
		[true, false, true],
	);
	t.deepEqual(
		captured.map(item => item.notReached),
		[undefined, 'session-lost', undefined],
	);
	t.deepEqual(
		captured.map(item => item.snapshot),
		[admittedDashboard, '', admittedDashboard],
	);
});

// --- assembleReport ---------------------------------------------------------

const judgedNothing = () => ({
	findingsByPage: new Map(),
	noteByPage: new Map(),
	finished: new Set<string>(),
});

const builder = () =>
	new ReportBuilder({...fsPromises, writeFile: sinon.stub().resolves()});

const capturedPage = (
	path: string,
	overrides: Partial<CapturedPage>,
): CapturedPage => ({
	page: page(path),
	snapshot: '',
	measurement: noMeasurement('page-not-loaded'),
	stage: 'loaded',
	...overrides,
});

test('a page the session refused is closed as failed, with its reason', t => {
	const report = builder();

	assembleReport(
		report,
		[
			capturedPage('/billing', {
				failureReason: refusalDetail,
				notReached: 'session-lost',
			}),
		],
		judgedNothing(),
	);

	const [analysis] = report.getCurrentState().completedAnalyses;
	t.is(analysis?.status, 'failed');
	t.is(analysis?.error, refusalDetail);
	t.is(analysis?.pageUrl, `${origin}/billing`);
});

test('a page whose capture failed for another reason is still partial', t => {
	const report = builder();

	assembleReport(
		report,
		[
			capturedPage('/slow', {
				failureReason:
					'The page structure could not be read: the capture returned nothing',
			}),
		],
		judgedNothing(),
	);

	const [analysis] = report.getCurrentState().completedAnalyses;
	t.is(analysis?.status, 'partial');
});

test('a refused page between two reviewed ones leaves them as they were', t => {
	const report = builder();
	const reviewed = (path: string) =>
		capturedPage(path, {snapshot: admittedDashboard, stage: 'analysable'});

	assembleReport(
		report,
		[
			reviewed('/dashboard'),
			capturedPage('/billing', {
				failureReason: refusalDetail,
				notReached: 'session-lost',
			}),
			reviewed('/settings'),
		],
		{
			...judgedNothing(),
			finished: new Set([`${origin}/dashboard`, `${origin}/settings`]),
		},
	);

	t.deepEqual(
		report
			.getCurrentState()
			.completedAnalyses.map(analysis => [analysis.pageUrl, analysis.status]),
		[
			[`${origin}/dashboard`, 'complete'],
			[`${origin}/billing`, 'failed'],
			[`${origin}/settings`, 'complete'],
		],
	);
});

test('the address a page was reached at is carried into the report', t => {
	const report = builder();

	assembleReport(
		report,
		[
			capturedPage('/home', {
				snapshot: admittedDashboard,
				stage: 'analysable',
				reachedUrl: `${origin}/dashboard`,
			}),
		],
		{...judgedNothing(), finished: new Set([`${origin}/home`])},
	);

	const [analysis] = report.getCurrentState().completedAnalyses;
	t.is(analysis?.reachedUrl, `${origin}/dashboard`);
});
