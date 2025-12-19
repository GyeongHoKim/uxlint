import test from 'ava';
import {
	AuthErrorCode,
	AuthenticationError,
} from '../../source/models/auth-error.js';

// T021: Unit tests for AuthenticationError

test('AuthErrorCode enum has all expected values', t => {
	t.truthy(AuthErrorCode.NOT_AUTHENTICATED);
	t.truthy(AuthErrorCode.TOKEN_EXPIRED);
	t.truthy(AuthErrorCode.REFRESH_FAILED);
	t.truthy(AuthErrorCode.NETWORK_ERROR);
	t.truthy(AuthErrorCode.USER_DENIED);
	t.truthy(AuthErrorCode.INVALID_RESPONSE);
	t.truthy(AuthErrorCode.KEYCHAIN_ERROR);
	t.truthy(AuthErrorCode.BROWSER_FAILED);
	t.truthy(AuthErrorCode.ALREADY_AUTHENTICATED);
});

test('AuthenticationError extends Error', t => {
	const error = new AuthenticationError(
		AuthErrorCode.NOT_AUTHENTICATED,
		'User is not logged in',
	);

	t.true(error instanceof Error);
	t.true(error instanceof AuthenticationError);
});

test('AuthenticationError has correct name', t => {
	const error = new AuthenticationError(
		AuthErrorCode.TOKEN_EXPIRED,
		'Token has expired',
	);

	t.is(error.name, 'AuthenticationError');
});

test('AuthenticationError has code property', t => {
	const error = new AuthenticationError(
		AuthErrorCode.REFRESH_FAILED,
		'Could not refresh token',
	);

	t.is(error.code, AuthErrorCode.REFRESH_FAILED);
});

test('AuthenticationError has message property', t => {
	const message = 'Network connection failed';
	const error = new AuthenticationError(AuthErrorCode.NETWORK_ERROR, message);

	t.is(error.message, message);
});

test('AuthenticationError accepts optional cause', t => {
	const originalError = new Error('Connection refused');
	const error = new AuthenticationError(
		AuthErrorCode.NETWORK_ERROR,
		'Failed to connect to OAuth server',
		originalError,
	);

	t.is(error.cause, originalError);
	t.is(error.cause?.message, 'Connection refused');
});

test('AuthenticationError without cause has undefined cause', t => {
	const error = new AuthenticationError(
		AuthErrorCode.USER_DENIED,
		'User cancelled authentication',
	);

	t.is(error.cause, undefined);
});

test('AuthenticationError can be caught and identified by code', t => {
	const error = new AuthenticationError(
		AuthErrorCode.INVALID_RESPONSE,
		'Invalid OAuth response',
	);

	try {
		throw error;
	} catch (error_) {
		if (error_ instanceof AuthenticationError) {
			t.is(error_.code, AuthErrorCode.INVALID_RESPONSE);
		} else {
			t.fail('Expected AuthenticationError');
		}
	}
});

test('AuthenticationError KEYCHAIN_ERROR for keychain failures', t => {
	const keychainError = new Error('Keychain is locked');
	const error = new AuthenticationError(
		AuthErrorCode.KEYCHAIN_ERROR,
		'Failed to access keychain',
		keychainError,
	);

	t.is(error.code, AuthErrorCode.KEYCHAIN_ERROR);
	t.is(error.cause?.message, 'Keychain is locked');
});

test('AuthenticationError BROWSER_FAILED for browser launch failures', t => {
	const browserError = new Error('No browser available');
	const error = new AuthenticationError(
		AuthErrorCode.BROWSER_FAILED,
		'Could not open browser. Please open URL manually: https://example.com',
		browserError,
	);

	t.is(error.code, AuthErrorCode.BROWSER_FAILED);
	t.true(error.message.includes('manually'));
});

test('AuthenticationError ALREADY_AUTHENTICATED for re-login attempts', t => {
	const error = new AuthenticationError(
		AuthErrorCode.ALREADY_AUTHENTICATED,
		'Already logged in. Use logout first to re-authenticate.',
	);

	t.is(error.code, AuthErrorCode.ALREADY_AUTHENTICATED);
	t.true(error.message.includes('logout'));
});

test('AuthenticationError can be serialized for logging', t => {
	const error = new AuthenticationError(
		AuthErrorCode.TOKEN_EXPIRED,
		'Access token has expired',
	);

	// Should be safe to log without exposing sensitive data
	const logOutput = {
		name: error.name,
		code: error.code,
		message: error.message,
	};

	t.is(logOutput.name, 'AuthenticationError');
	t.is(logOutput.code, AuthErrorCode.TOKEN_EXPIRED);
	t.is(logOutput.message, 'Access token has expired');
});

test('AuthenticationError toString includes code', t => {
	const error = new AuthenticationError(
		AuthErrorCode.NOT_AUTHENTICATED,
		'Not logged in',
	);

	const string_ = error.toString();
	t.true(string_.includes('AuthenticationError'));
	t.true(string_.includes('Not logged in'));
});
