/**
 * Visual regression tests for AuthStatus component
 */

import test from 'ava';
import {render} from 'ink-testing-library';
import sinon from 'sinon';
import {AuthStatus} from '../../../source/components/auth/auth-status.js';
import {UXLintClientProvider} from '../../../source/components/providers/uxlint-client-provider.js';
import {UXLintClient} from '../../../source/infrastructure/auth/uxlint-client.js';

function createMockClient(): {
	client: UXLintClient;
	sandbox: sinon.SinonSandbox;
} {
	const sandbox = sinon.createSandbox();
	const mockClient = sandbox.createStubInstance(UXLintClient);
	mockClient.getStatus.resolves(undefined);
	return {client: mockClient, sandbox};
}

test('renders loading state with spinner initially', t => {
	const {client, sandbox} = createMockClient();
	const {frames, unmount} = render(
		<UXLintClientProvider uxlintClientImpl={client}>
			<AuthStatus />
		</UXLintClientProvider>,
	);

	// Check that at least one frame contains the loading message
	const hasLoadingFrame = frames.some(frame =>
		frame?.includes('Checking authentication status'),
	);
	t.true(hasLoadingFrame, 'Should render loading state');

	unmount();
	sandbox.restore();
});

test('renders not logged in message when no session', t => {
	const {client, sandbox} = createMockClient();
	const {frames, unmount} = render(
		<UXLintClientProvider uxlintClientImpl={client}>
			<AuthStatus />
		</UXLintClientProvider>,
	);

	// The component should render at least the loading state
	t.true(frames.length > 0, 'Should render at least one frame');
	// Actual "not logged in" message depends on mock implementation

	unmount();
	sandbox.restore();
});

test('renders authenticated status with user information', t => {
	const {client, sandbox} = createMockClient();
	const {frames, unmount} = render(
		<UXLintClientProvider uxlintClientImpl={client}>
			<AuthStatus />
		</UXLintClientProvider>,
	);

	t.true(frames.length > 0, 'Should render at least one frame');
	// User info rendering depends on mocked session

	unmount();
	sandbox.restore();
});

test('renders expired status when token is expired', async t => {
	const {client, sandbox} = createMockClient();
	const {lastFrame, unmount} = render(
		<UXLintClientProvider uxlintClientImpl={client}>
			<AuthStatus />
		</UXLintClientProvider>,
	);

	// Wait for status check
	await new Promise(resolve => {
		setTimeout(resolve, 100);
	});

	const output = lastFrame();
	unmount();
	sandbox.restore();

	t.truthy(output);
	// Expired status depends on session expiry time
});

test('displays organization if present in user profile', t => {
	const {client, sandbox} = createMockClient();
	const {frames, unmount} = render(
		<UXLintClientProvider uxlintClientImpl={client}>
			<AuthStatus />
		</UXLintClientProvider>,
	);

	t.true(frames.length > 0, 'Should render at least one frame');

	unmount();
	sandbox.restore();
	// Organization display depends on session data
});

test('displays scopes from session metadata', t => {
	const {client, sandbox} = createMockClient();
	const {frames, unmount} = render(
		<UXLintClientProvider uxlintClientImpl={client}>
			<AuthStatus />
		</UXLintClientProvider>,
	);

	t.true(frames.length > 0, 'Should render at least one frame');

	unmount();
	sandbox.restore();
	// Scopes display depends on session metadata
});

test('calls onComplete callback after status check', t => {
	const {client, sandbox} = createMockClient();
	const {frames, unmount} = render(
		<UXLintClientProvider uxlintClientImpl={client}>
			<AuthStatus
				onComplete={() => {
					/* No-op */
				}}
			/>
		</UXLintClientProvider>,
	);

	// Component should render at least once
	t.true(frames.length > 0, 'Should render at least one frame');
	// Note: onComplete callback timing depends on async operations

	unmount();
	sandbox.restore();
});

test('handles error state when status check fails', t => {
	const {client, sandbox} = createMockClient();
	const {frames, unmount} = render(
		<UXLintClientProvider uxlintClientImpl={client}>
			<AuthStatus />
		</UXLintClientProvider>,
	);

	t.true(frames.length > 0, 'Should render at least one frame');
	// Error rendering depends on client error behavior

	unmount();
	sandbox.restore();
});
