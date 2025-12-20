/**
 * Visual regression tests for AuthError component
 */

import test from 'ava';
import {render} from 'ink-testing-library';
import {AuthError} from '../../../source/components/auth/auth-error.js';
import {
	AuthErrorCode,
	AuthenticationError,
} from '../../../source/models/auth-error.js';

test('displays generic error message for unknown errors', t => {
	const error = new Error('Something went wrong');

	const {lastFrame, unmount} = render(<AuthError error={error} />);

	const output = lastFrame();
	t.truthy(output);
	t.true(output?.includes('Something went wrong'));
	t.true(output?.includes('Authentication Error'));

	unmount();
});

test('handles USER_DENIED error with no retry option', t => {
	const error = new AuthenticationError(
		AuthErrorCode.USER_DENIED,
		'User cancelled',
	);

	const {lastFrame, unmount} = render(<AuthError error={error} />);

	const output = lastFrame();
	t.truthy(output);
	t.true(output?.includes('Authentication Cancelled'));
	t.true(output?.includes('cancelled the authentication'));
	t.false(output?.includes('Press any key to retry'));

	unmount();
});

test('handles NETWORK_ERROR with retry option', t => {
	const error = new AuthenticationError(
		AuthErrorCode.NETWORK_ERROR,
		'Network error',
	);

	const {lastFrame, unmount} = render(
		<AuthError
			error={error}
			onRetry={() => {
				/* No-op */
			}}
		/>,
	);

	const output = lastFrame();
	t.truthy(output);
	t.true(output?.includes('Network Error'));
	t.true(output?.includes('check your internet connection'));
	t.true(output?.includes('Press any key to retry'));

	unmount();
});

test('handles REFRESH_FAILED error', t => {
	const error = new AuthenticationError(
		AuthErrorCode.REFRESH_FAILED,
		'Refresh failed',
	);

	const {lastFrame, unmount} = render(<AuthError error={error} />);

	const output = lastFrame();
	t.truthy(output);
	t.true(output?.includes('Session Expired'));
	t.true(output?.includes('could not be refreshed'));

	unmount();
});

test('handles KEYCHAIN_ERROR with no retry', t => {
	const error = new AuthenticationError(
		AuthErrorCode.KEYCHAIN_ERROR,
		'Keychain error',
	);

	const {lastFrame, unmount} = render(<AuthError error={error} />);

	const output = lastFrame();
	t.truthy(output);
	t.true(output?.includes('Keychain Error'));
	t.true(output?.includes('system keychain'));
	t.false(output?.includes('Press any key to retry'));

	unmount();
});

test('handles INVALID_RESPONSE error', t => {
	const error = new AuthenticationError(
		AuthErrorCode.INVALID_RESPONSE,
		'Invalid response',
	);

	const {lastFrame, unmount} = render(<AuthError error={error} />);

	const output = lastFrame();
	t.truthy(output);
	t.true(output?.includes('Invalid Response'));

	unmount();
});

test('handles NOT_AUTHENTICATED error', t => {
	const error = new AuthenticationError(
		AuthErrorCode.NOT_AUTHENTICATED,
		'Not authenticated',
	);

	const {lastFrame, unmount} = render(<AuthError error={error} />);

	const output = lastFrame();
	t.truthy(output);
	t.true(output?.includes('Not Authenticated'));
	t.true(output?.includes('not logged in'));

	unmount();
});

test('handles TOKEN_EXPIRED error', t => {
	const error = new AuthenticationError(
		AuthErrorCode.TOKEN_EXPIRED,
		'Token expired',
	);

	const {lastFrame, unmount} = render(<AuthError error={error} />);

	const output = lastFrame();
	t.truthy(output);
	t.true(output?.includes('Token Expired'));

	unmount();
});

test('handles ALREADY_AUTHENTICATED error', t => {
	const error = new AuthenticationError(
		AuthErrorCode.ALREADY_AUTHENTICATED,
		'Already authenticated',
	);

	const {lastFrame, unmount} = render(<AuthError error={error} />);

	const output = lastFrame();
	t.truthy(output);
	t.true(output?.includes('Already Authenticated'));
	t.true(output?.includes('already logged in'));

	unmount();
});

test('handles BROWSER_FAILED error', t => {
	const error = new AuthenticationError(
		AuthErrorCode.BROWSER_FAILED,
		'Browser failed',
	);

	const {lastFrame, unmount} = render(<AuthError error={error} />);

	const output = lastFrame();
	t.truthy(output);
	t.true(output?.includes('Browser Error'));

	unmount();
});

test('does not show retry option when onRetry is not provided', t => {
	const error = new AuthenticationError(
		AuthErrorCode.NETWORK_ERROR,
		'Network error',
	);

	const {lastFrame, unmount} = render(<AuthError error={error} />);

	const output = lastFrame();
	t.truthy(output);
	t.false(output?.includes('Press any key to retry'));

	unmount();
});

test('shows retry instruction when onRetry is provided and error allows retry', t => {
	const error = new AuthenticationError(
		AuthErrorCode.NETWORK_ERROR,
		'Network error',
	);

	const {lastFrame, unmount} = render(
		<AuthError
			error={error}
			onRetry={() => {
				/* No-op */
			}}
		/>,
	);

	const output = lastFrame();
	t.truthy(output);
	t.true(output?.includes('Press any key to retry'));

	unmount();
});
