/**
 * Visual regression tests for LoginFlow component
 */

import test from 'ava';
import {render} from 'ink-testing-library';
import sinon from 'sinon';
import {LoginFlow} from '../../../source/components/auth/login-flow.js';
import {UXLintClientProvider} from '../../../source/components/providers/uxlint-client-provider.js';
import {UXLintClient} from '../../../source/infrastructure/auth/uxlint-client.js';
import {
	AuthErrorCode,
	AuthenticationError,
} from '../../../source/models/auth-error.js';
import type {UserProfile} from '../../../source/models/user-profile.js';

// Create mock client for testing using SinonJS
function createMockClient(
	scenario: 'success' | 'error' | 'browser-failed' | 'already-authenticated',
): {client: UXLintClient; sandbox: sinon.SinonSandbox} {
	const sandbox = sinon.createSandbox();
	const mockClient = sandbox.createStubInstance(UXLintClient);

	const mockProfile: UserProfile = {
		id: 'test-user-id',
		email: 'test@example.com',
		name: 'Test User',
		emailVerified: true,
	};

	// Configure stub based on scenario
	switch (scenario) {
		case 'browser-failed': {
			mockClient.login.rejects(
				new AuthenticationError(
					AuthErrorCode.BROWSER_FAILED,
					'Browser failed. Please open: https://example.com/auth',
				),
			);
			break;
		}

		case 'already-authenticated': {
			mockClient.login.rejects(
				new AuthenticationError(
					AuthErrorCode.ALREADY_AUTHENTICATED,
					'Already authenticated',
				),
			);
			mockClient.getUserProfile.resolves(mockProfile);
			break;
		}

		case 'error': {
			mockClient.login.rejects(new Error('Network error'));
			break;
		}

		case 'success': {
			mockClient.login.resolves();
			mockClient.getUserProfile.resolves(mockProfile);
			break;
		}
	}

	return {client: mockClient, sandbox};
}

test('renders opening browser spinner initially', t => {
	const {client, sandbox} = createMockClient('success');

	const {frames, unmount} = render(
		<UXLintClientProvider uxlintClientImpl={client}>
			<LoginFlow
				onComplete={() => {
					// Success callback
				}}
				onError={() => {
					// Error callback
				}}
			/>
		</UXLintClientProvider>,
	);

	// Check that at least one frame contains the opening browser message
	const hasOpeningBrowserFrame = frames.some(frame =>
		frame?.includes('Opening browser'),
	);
	t.true(hasOpeningBrowserFrame, 'Should render opening browser spinner');

	unmount();
	sandbox.restore();
});

test('renders success state with checkmark', async t => {
	const {client, sandbox} = createMockClient('success');

	const {frames, unmount} = render(
		<UXLintClientProvider uxlintClientImpl={client}>
			<LoginFlow
				onComplete={() => {
					// Success callback
				}}
				onError={() => {
					t.fail('onError should not be called');
				}}
			/>
		</UXLintClientProvider>,
	);

	// Wait for async login to complete
	await new Promise(resolve => {
		setTimeout(resolve, 100);
	});

	// Should have success frame
	const hasSuccessFrame = frames.some(frame => frame?.includes('✓'));
	t.true(hasSuccessFrame, 'Should render success state');

	unmount();
	sandbox.restore();
});

test('renders error state with error message', async t => {
	const {client, sandbox} = createMockClient('error');
	let errorCalled = false;

	const {frames, unmount} = render(
		<UXLintClientProvider uxlintClientImpl={client}>
			<LoginFlow
				onComplete={() => {
					t.fail('onComplete should not be called on error');
				}}
				onError={() => {
					errorCalled = true;
				}}
			/>
		</UXLintClientProvider>,
	);

	// Wait for async login to fail
	await new Promise(resolve => {
		setTimeout(resolve, 100);
	});

	// Should have error frame
	const hasErrorFrame = frames.some(frame => frame?.includes('✗'));
	t.true(hasErrorFrame, 'Should render error state');
	t.true(errorCalled, 'Should call onError');

	unmount();
	sandbox.restore();
});

test('renders browser fallback when browser launch fails', async t => {
	const {client, sandbox} = createMockClient('browser-failed');

	const {frames, unmount} = render(
		<UXLintClientProvider uxlintClientImpl={client}>
			<LoginFlow
				onComplete={() => {
					// Will be called by fallback component
				}}
				onError={() => {
					// May be called on fallback error
				}}
			/>
		</UXLintClientProvider>,
	);

	// Wait for browser failure to trigger
	await new Promise(resolve => {
		setTimeout(resolve, 100);
	});

	// Should show fallback component (contains URL)
	const hasFallbackFrame = frames.some(frame =>
		frame?.includes('https://example.com/auth'),
	);
	t.true(hasFallbackFrame, 'Should render browser fallback with URL');

	unmount();
	sandbox.restore();
});

test('handles already authenticated scenario', async t => {
	const {client, sandbox} = createMockClient('already-authenticated');

	const {frames, unmount} = render(
		<UXLintClientProvider uxlintClientImpl={client}>
			<LoginFlow
				onComplete={() => {
					// Success callback
				}}
				onError={() => {
					t.fail('Should not error when already authenticated');
				}}
			/>
		</UXLintClientProvider>,
	);

	// Wait for already-authenticated scenario to complete
	await new Promise(resolve => {
		setTimeout(resolve, 100);
	});

	// Should complete successfully
	const hasSuccessFrame = frames.some(frame => frame?.includes('✓'));
	t.true(
		hasSuccessFrame,
		'Should render success state for already authenticated',
	);

	unmount();
	sandbox.restore();
});
