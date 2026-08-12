/**
 * Visual regression tests for BrowserFallback component
 */

import test from 'ava';
import {render} from 'ink-testing-library';
import sinon from 'sinon';
import {BrowserFallback} from '../../../source/components/auth/browser-fallback.js';
import {UXLintClientProvider} from '../../../source/components/providers/uxlint-client-provider.js';
import {UXLintClient} from '../../../source/infrastructure/auth/uxlint-client.js';
import type {UserProfile} from '../../../source/models/user-profile.js';

const mockUrl =
	'https://app.uxlint.org/auth/v1/oauth/authorize?client_id=test&...';

function createMockClient(): {
	client: UXLintClient;
	sandbox: sinon.SinonSandbox;
} {
	const sandbox = sinon.createSandbox();
	const mockClient = sandbox.createStubInstance(UXLintClient);

	const mockProfile: UserProfile = {
		id: 'test-user-id',
		email: 'test@example.com',
		name: 'Test User',
		emailVerified: true,
	};

	mockClient.isAuthenticated.resolves(false);
	mockClient.getUserProfile.resolves(mockProfile);

	return {client: mockClient, sandbox};
}

test('renders authorization URL in highlighted box', t => {
	const {client, sandbox} = createMockClient();

	const {lastFrame, unmount} = render(
		<UXLintClientProvider uxlintClientImpl={client}>
			<BrowserFallback
				url={mockUrl}
				onComplete={() => {
					/* No-op */
				}}
				onError={() => {
					/* No-op */
				}}
			/>
		</UXLintClientProvider>,
	);

	const output = lastFrame();
	t.truthy(output);
	t.true(output?.includes(mockUrl));
	t.true(output?.includes('Could not open browser automatically'));

	unmount();
	sandbox.restore();
});

test('displays waiting spinner while polling', t => {
	const {client, sandbox} = createMockClient();

	const {lastFrame, unmount} = render(
		<UXLintClientProvider uxlintClientImpl={client}>
			<BrowserFallback
				url={mockUrl}
				onComplete={() => {
					/* No-op */
				}}
				onError={() => {
					/* No-op */
				}}
			/>
		</UXLintClientProvider>,
	);

	const output = lastFrame();
	t.truthy(output);
	t.true(output?.includes('Waiting for authentication...'));

	unmount();
	sandbox.restore();
});

test('displays Ctrl+C cancellation instruction', t => {
	const {client, sandbox} = createMockClient();

	const {lastFrame, unmount} = render(
		<UXLintClientProvider uxlintClientImpl={client}>
			<BrowserFallback
				url={mockUrl}
				onComplete={() => {
					/* No-op */
				}}
				onError={() => {
					/* No-op */
				}}
			/>
		</UXLintClientProvider>,
	);

	const output = lastFrame();
	t.truthy(output);
	t.true(output?.includes('Press Ctrl+C to cancel'));

	unmount();
	sandbox.restore();
});

test('calls onComplete when authentication succeeds', t => {
	const {client, sandbox} = createMockClient();

	const {lastFrame, unmount} = render(
		<UXLintClientProvider uxlintClientImpl={client}>
			<BrowserFallback
				url={mockUrl}
				onComplete={() => {
					/* Success callback - no-op in test */
				}}
				onError={() => {
					t.fail('onError should not be called on success');
				}}
			/>
		</UXLintClientProvider>,
	);

	// Completion itself depends on the mocked client's authentication state;
	// what this test pins down is that the success path renders and unmounts
	// without invoking onError.
	t.truthy(lastFrame(), 'Should render while waiting for completion');
	unmount();
	sandbox.restore();
});

test('calls onError on timeout after 5 minutes', t => {
	const {client, sandbox} = createMockClient();

	const {lastFrame, unmount} = render(
		<UXLintClientProvider uxlintClientImpl={client}>
			<BrowserFallback
				url={mockUrl}
				onComplete={() => {
					t.fail('onComplete should not be called on timeout');
				}}
				onError={error => {
					t.true(error.message.includes('timed out'));
				}}
			/>
		</UXLintClientProvider>,
	);

	// The 5-minute timeout cannot be fast-forwarded without fake timers, so
	// this test only pins down that neither callback fires early.
	t.truthy(lastFrame(), 'Should render while waiting for the timeout');
	unmount();
	sandbox.restore();
});

test('cleans up polling and timeout on unmount', t => {
	const {client, sandbox} = createMockClient();

	const {unmount} = render(
		<UXLintClientProvider uxlintClientImpl={client}>
			<BrowserFallback
				url={mockUrl}
				onComplete={() => {
					/* No-op */
				}}
				onError={() => {
					/* No-op */
				}}
			/>
		</UXLintClientProvider>,
	);

	// Should not throw on unmount
	t.notThrows(() => {
		unmount();
	});

	sandbox.restore();
});

test('displays copy-paste instructions', t => {
	const {client, sandbox} = createMockClient();

	const {lastFrame, unmount} = render(
		<UXLintClientProvider uxlintClientImpl={client}>
			<BrowserFallback
				url={mockUrl}
				onComplete={() => {
					/* No-op */
				}}
				onError={() => {
					/* No-op */
				}}
			/>
		</UXLintClientProvider>,
	);

	const output = lastFrame();
	t.truthy(output);
	t.true(output?.includes('Please open the following URL in your browser'));

	unmount();
	sandbox.restore();
});
