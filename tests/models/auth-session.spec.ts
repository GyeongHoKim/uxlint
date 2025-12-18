import test from 'ava';
import {
	isSessionExpired,
	isValidSession,
	type AuthenticationSession,
} from '../../source/models/auth-session.js';

test('isValidSession() returns true for valid session', t => {
	const session: AuthenticationSession = {
		version: 1,
		user: {
			id: 'user_1',
			email: 'user@example.com',
			name: 'User',
		},
		tokens: {
			accessToken: 'access',
			tokenType: 'Bearer',
			expiresIn: 3600,
			refreshToken: 'refresh',
			idToken: 'id.token',
			scope: 'openid profile email',
		},
		metadata: {
			createdAt: new Date().toISOString(),
			expiresAt: new Date(Date.now() + 60_000).toISOString(),
		},
	};

	t.true(isValidSession(session));
});

test('isValidSession() returns false for invalid shapes', t => {
	t.false(isValidSession(null));
	t.false(isValidSession('nope'));
	t.false(isValidSession({}));
	t.false(
		isValidSession({
			version: 1,
			user: {id: 'u', email: 'e', name: 'n'},
			tokens: {
				accessToken: 'access',
				tokenType: 'Bearer',
				expiresIn: 3600,
				refreshToken: 'refresh',
			},
			metadata: {
				createdAt: 'not-a-date',
				expiresAt: 'not-a-date',
			},
		}),
	);
});

test('isSessionExpired() respects buffer', t => {
	const session: AuthenticationSession = {
		version: 1,
		user: {id: 'user_1', email: 'user@example.com', name: 'User'},
		tokens: {
			accessToken: 'access',
			tokenType: 'Bearer',
			expiresIn: 3600,
			refreshToken: 'refresh',
		},
		metadata: {
			createdAt: new Date().toISOString(),
			expiresAt: new Date(Date.now() + 60_000).toISOString(),
		},
	};

	t.false(isSessionExpired(session));
	// If we consider it expiring within 2 minutes, it should be treated as expired
	t.true(isSessionExpired(session, 120_000));
});
