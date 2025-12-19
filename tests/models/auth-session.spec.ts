import test from 'ava';
import {
	isValidSession,
	isSessionExpired,
	type AuthenticationSession,
} from '../../source/models/auth-session.js';

// Helper to create a valid session
function createValidSession(
	overrides: Partial<AuthenticationSession> = {},
): AuthenticationSession {
	const base: AuthenticationSession = {
		version: 1,
		user: {
			id: 'user_123',
			email: 'test@example.com',
			name: 'Test User',
			emailVerified: true,
		},
		tokens: {
			accessToken: 'access_token_123',
			tokenType: 'Bearer',
			expiresIn: 3600,
			refreshToken: 'refresh_token_123',
			scope: 'openid profile email',
		},
		metadata: {
			createdAt: new Date().toISOString(),
			lastRefreshedAt: new Date().toISOString(),
			expiresAt: new Date(Date.now() + 3600 * 1000).toISOString(),
			scopes: ['openid', 'profile', 'email'],
		},
	};

	return {...base, ...overrides};
}

// T011: Test for isValidSession type guard
test('isValidSession returns true for valid session', t => {
	const session = createValidSession();
	t.true(isValidSession(session));
});

test('isValidSession returns false for null', t => {
	t.false(isValidSession(null));
});

test('isValidSession returns false for undefined', t => {
	t.false(isValidSession(undefined));
});

test('isValidSession returns false for non-object', t => {
	t.false(isValidSession('string'));
	t.false(isValidSession(123));
	t.false(isValidSession(true));
});

test('isValidSession returns false when user is missing', t => {
	const session = createValidSession();
	// @ts-expect-error Testing invalid session
	delete session.user;
	t.false(isValidSession(session));
});

test('isValidSession returns false when user.id is missing', t => {
	const session = createValidSession();
	// @ts-expect-error Testing invalid session
	delete session.user.id;
	t.false(isValidSession(session));
});

test('isValidSession returns false when user.email is missing', t => {
	const session = createValidSession();
	// @ts-expect-error Testing invalid session
	delete session.user.email;
	t.false(isValidSession(session));
});

test('isValidSession returns false when tokens is missing', t => {
	const session = createValidSession();
	// @ts-expect-error Testing invalid session
	delete session.tokens;
	t.false(isValidSession(session));
});

test('isValidSession returns false when tokens.accessToken is missing', t => {
	const session = createValidSession();
	// @ts-expect-error Testing invalid session
	delete session.tokens.accessToken;
	t.false(isValidSession(session));
});

test('isValidSession returns false when tokens.refreshToken is missing', t => {
	const session = createValidSession();
	// @ts-expect-error Testing invalid session
	delete session.tokens.refreshToken;
	t.false(isValidSession(session));
});

test('isValidSession returns false when metadata is missing', t => {
	const session = createValidSession();
	// @ts-expect-error Testing invalid session
	delete session.metadata;
	t.false(isValidSession(session));
});

test('isValidSession returns false when metadata.expiresAt is missing', t => {
	const session = createValidSession();
	// @ts-expect-error Testing invalid session
	delete session.metadata.expiresAt;
	t.false(isValidSession(session));
});

// T014: Test for isSessionExpired
test('isSessionExpired returns false for non-expired session', t => {
	const session = createValidSession({
		metadata: {
			createdAt: new Date().toISOString(),
			lastRefreshedAt: new Date().toISOString(),
			expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(), // 1 hour from now
			scopes: ['openid'],
		},
	});
	t.false(isSessionExpired(session));
});

test('isSessionExpired returns true for expired session', t => {
	const session = createValidSession({
		metadata: {
			createdAt: new Date().toISOString(),
			lastRefreshedAt: new Date().toISOString(),
			expiresAt: new Date(Date.now() - 60 * 1000).toISOString(), // 1 minute ago
			scopes: ['openid'],
		},
	});
	t.true(isSessionExpired(session));
});

test('isSessionExpired returns true when expiring within buffer window', t => {
	const session = createValidSession({
		metadata: {
			createdAt: new Date().toISOString(),
			lastRefreshedAt: new Date().toISOString(),
			expiresAt: new Date(Date.now() + 3 * 60 * 1000).toISOString(), // 3 minutes from now
			scopes: ['openid'],
		},
	});
	// Default buffer is 5 minutes, so 3 minutes from now should be considered expired
	t.true(isSessionExpired(session));
});

test('isSessionExpired uses custom buffer when provided', t => {
	const session = createValidSession({
		metadata: {
			createdAt: new Date().toISOString(),
			lastRefreshedAt: new Date().toISOString(),
			expiresAt: new Date(Date.now() + 3 * 60 * 1000).toISOString(), // 3 minutes from now
			scopes: ['openid'],
		},
	});
	// With 2 minute buffer, 3 minutes from now should NOT be expired
	t.false(isSessionExpired(session, 2));
});

test('isSessionExpired returns false when exactly at buffer boundary', t => {
	const bufferMinutes = 5;
	const session = createValidSession({
		metadata: {
			createdAt: new Date().toISOString(),
			lastRefreshedAt: new Date().toISOString(),
			expiresAt: new Date(
				Date.now() + bufferMinutes * 60 * 1000 + 1000,
			).toISOString(), // Just past buffer
			scopes: ['openid'],
		},
	});
	t.false(isSessionExpired(session, bufferMinutes));
});
