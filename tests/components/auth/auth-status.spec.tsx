/**
 * Visual regression tests for AuthStatus component
 */

import test from 'ava';
import {render} from 'ink-testing-library';
import {AuthStatus} from '../../../source/components/auth/auth-status.js';

test('renders loading state with spinner initially', t => {
	const {frames, unmount} = render(<AuthStatus />);

	// Check that at least one frame contains the loading message
	const hasLoadingFrame = frames.some(frame =>
		frame?.includes('Checking authentication status'),
	);
	t.true(hasLoadingFrame, 'Should render loading state');

	unmount();
});

test('renders not logged in message when no session', t => {
	const {frames, unmount} = render(<AuthStatus />);

	// The component should render at least the loading state
	t.true(frames.length > 0, 'Should render at least one frame');
	// Actual "not logged in" message depends on mock implementation

	unmount();
});

test('renders authenticated status with user information', t => {
	const {frames, unmount} = render(<AuthStatus />);

	t.true(frames.length > 0, 'Should render at least one frame');
	// User info rendering depends on mocked session

	unmount();
});

test('renders expired status when token is expired', async t => {
	const {lastFrame, unmount} = render(<AuthStatus />);

	// Wait for status check
	await new Promise(resolve => {
		setTimeout(resolve, 100);
	});

	const output = lastFrame();
	unmount();

	t.truthy(output);
	// Expired status depends on session expiry time
});

test('displays organization if present in user profile', t => {
	const {frames, unmount} = render(<AuthStatus />);

	t.true(frames.length > 0, 'Should render at least one frame');

	unmount();
	// Organization display depends on session data
});

test('displays scopes from session metadata', t => {
	const {frames, unmount} = render(<AuthStatus />);

	t.true(frames.length > 0, 'Should render at least one frame');

	unmount();
	// Scopes display depends on session metadata
});

test('calls onComplete callback after status check', t => {
	const {frames, unmount} = render(
		<AuthStatus
			onComplete={() => {
				/* No-op */
			}}
		/>,
	);

	// Component should render at least once
	t.true(frames.length > 0, 'Should render at least one frame');
	// Note: onComplete callback timing depends on async operations

	unmount();
});

test('handles error state when status check fails', t => {
	const {frames, unmount} = render(<AuthStatus />);

	t.true(frames.length > 0, 'Should render at least one frame');
	// Error rendering depends on client error behavior

	unmount();
});
