/**
 * Visual regression tests for LoginFlow component
 */

import test from 'ava';
import {render} from 'ink-testing-library';
import {LoginFlow} from '../../../source/components/auth/login-flow.js';
import {
	AuthErrorCode,
	AuthenticationError,
} from '../../../source/models/auth-error.js';
import type {UserProfile} from '../../../source/models/user-profile.js';

// Create mock client for testing
function createMockClient(
	scenario: 'success' | 'error' | 'browser-failed' | 'already-authenticated',
) {
	const mockProfile: UserProfile = {
		id: 'test-user-id',
		email: 'test@example.com',
		name: 'Test User',
		emailVerified: true,
	};

	return {
		async login() {
			if (scenario === 'browser-failed') {
				throw new AuthenticationError(
					AuthErrorCode.BROWSER_FAILED,
					'Browser failed. Please open: https://example.com/auth',
				);
			}

			if (scenario === 'already-authenticated') {
				throw new AuthenticationError(
					AuthErrorCode.ALREADY_AUTHENTICATED,
					'Already authenticated',
				);
			}

			if (scenario === 'error') {
				throw new Error('Network error');
			}

			// Success - do nothing
		},
		getUserProfile: async () => mockProfile,
	};
}

test('renders opening browser spinner initially', t => {
	const mockClient = createMockClient('success');

	const {frames, unmount} = render(
		<LoginFlow
			client={mockClient}
			onComplete={() => {
				// Success callback
			}}
			onError={() => {
				// Error callback
			}}
		/>,
	);

	// Check that at least one frame contains the opening browser message
	const hasOpeningBrowserFrame = frames.some(frame =>
		frame?.includes('Opening browser'),
	);
	t.true(hasOpeningBrowserFrame, 'Should render opening browser spinner');

	unmount();
});

test('renders success state with checkmark', async t => {
	const mockClient = createMockClient('success');

	const {frames, unmount} = render(
		<LoginFlow
			client={mockClient}
			onComplete={() => {
				// Success callback
			}}
			onError={() => {
				t.fail('onError should not be called');
			}}
		/>,
	);

	// Wait for async login to complete
	await new Promise(resolve => {
		setTimeout(resolve, 100);
	});

	// Should have success frame
	const hasSuccessFrame = frames.some(frame => frame?.includes('✓'));
	t.true(hasSuccessFrame, 'Should render success state');

	unmount();
});

test('renders error state with error message', async t => {
	const mockClient = createMockClient('error');
	let errorCalled = false;

	const {frames, unmount} = render(
		<LoginFlow
			client={mockClient}
			onComplete={() => {
				t.fail('onComplete should not be called on error');
			}}
			onError={() => {
				errorCalled = true;
			}}
		/>,
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
});

test('renders browser fallback when browser launch fails', async t => {
	const mockClient = createMockClient('browser-failed');

	const {frames, unmount} = render(
		<LoginFlow
			client={mockClient}
			onComplete={() => {
				// Will be called by fallback component
			}}
			onError={() => {
				// May be called on fallback error
			}}
		/>,
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
});

test('handles already authenticated scenario', async t => {
	const mockClient = createMockClient('already-authenticated');

	const {frames, unmount} = render(
		<LoginFlow
			client={mockClient}
			onComplete={() => {
				// Success callback
			}}
			onError={() => {
				t.fail('Should not error when already authenticated');
			}}
		/>,
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
});
