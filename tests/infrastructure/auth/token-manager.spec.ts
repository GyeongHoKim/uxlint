import test from 'ava';
import {TokenManager} from '../../../source/infrastructure/auth/token-manager.js';
import type {AuthenticationSession} from '../../../source/models/auth-session.js';
import {MockKeychainService} from '../../mocks/services/index.js';

function createValidSession(): AuthenticationSession {
	return {
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
}

// T076: Unit tests for TokenManager
test('TokenManager.loadSession returns undefined when no session stored', async t => {
	const keychain = new MockKeychainService();
	const manager = new TokenManager(keychain);

	const session = await manager.loadSession();

	t.is(session, undefined);
});

test('TokenManager.loadSession returns stored session', async t => {
	const keychain = new MockKeychainService();
	const manager = new TokenManager(keychain);
	const validSession = createValidSession();

	await keychain.setPassword(
		'uxlint-cli',
		'default',
		JSON.stringify(validSession),
	);

	const session = await manager.loadSession();

	t.deepEqual(session?.user.email, validSession.user.email);
	t.deepEqual(session?.tokens.accessToken, validSession.tokens.accessToken);
});

test('TokenManager.saveSession stores session in keychain', async t => {
	const keychain = new MockKeychainService();
	const manager = new TokenManager(keychain);
	const validSession = createValidSession();

	await manager.saveSession(validSession);

	const stored = await keychain.getPassword('uxlint-cli', 'default');
	t.truthy(stored);

	const parsed = JSON.parse(stored!) as AuthenticationSession;
	t.is(parsed.user.email, validSession.user.email);
});

test('TokenManager.deleteSession removes session from keychain', async t => {
	const keychain = new MockKeychainService();
	const manager = new TokenManager(keychain);
	const validSession = createValidSession();

	await manager.saveSession(validSession);
	await manager.deleteSession();

	const stored = await keychain.getPassword('uxlint-cli', 'default');
	t.is(stored, undefined);
});

test('TokenManager.loadSession returns undefined for corrupted JSON', async t => {
	const keychain = new MockKeychainService();
	const manager = new TokenManager(keychain);

	await keychain.setPassword('uxlint-cli', 'default', 'invalid-json{');

	const session = await manager.loadSession();

	t.is(session, undefined);
});

test('TokenManager.loadSession deletes corrupted JSON', async t => {
	const keychain = new MockKeychainService();
	const manager = new TokenManager(keychain);

	await keychain.setPassword('uxlint-cli', 'default', 'invalid-json{');

	await manager.loadSession();

	const stored = await keychain.getPassword('uxlint-cli', 'default');
	t.is(stored, undefined);
});

test('TokenManager.loadSession returns undefined for invalid session structure', async t => {
	const keychain = new MockKeychainService();
	const manager = new TokenManager(keychain);

	// Missing required fields
	const invalidSession = {
		user: {id: 'user_123'},
		// Missing tokens and metadata
	};

	await keychain.setPassword(
		'uxlint-cli',
		'default',
		JSON.stringify(invalidSession),
	);

	const session = await manager.loadSession();

	t.is(session, undefined);
});

test('TokenManager.loadSession deletes invalid session', async t => {
	const keychain = new MockKeychainService();
	const manager = new TokenManager(keychain);

	const invalidSession = {user: {id: 'user_123'}};

	await keychain.setPassword(
		'uxlint-cli',
		'default',
		JSON.stringify(invalidSession),
	);

	await manager.loadSession();

	const stored = await keychain.getPassword('uxlint-cli', 'default');
	t.is(stored, undefined);
});

test('TokenManager uses correct service and account names', async t => {
	const keychain = new MockKeychainService();
	const manager = new TokenManager(keychain);
	const validSession = createValidSession();

	await manager.saveSession(validSession);

	// Check it's stored with correct key
	const keys = keychain.getKeys();
	t.deepEqual(keys, ['uxlint-cli:default']);
});

test('TokenManager.isKeychainAvailable returns keychain availability', async t => {
	const keychain = new MockKeychainService();
	const manager = new TokenManager(keychain);

	const available = await manager.isKeychainAvailable();

	t.true(available);
});

test('TokenManager can round-trip a complete session', async t => {
	const keychain = new MockKeychainService();
	const manager = new TokenManager(keychain);

	const original: AuthenticationSession = {
		version: 1,
		user: {
			id: 'user_456',
			email: 'developer@company.com',
			name: 'Jane Developer',
			organization: 'Company Inc',
			picture: 'https://example.com/jane.jpg',
			emailVerified: true,
		},
		tokens: {
			accessToken: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
			tokenType: 'Bearer',
			expiresIn: 7200,
			refreshToken: 'v1.MR5h...',
			idToken: 'eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9...',
			scope: 'openid profile email uxlint:api',
		},
		metadata: {
			createdAt: '2025-12-18T10:00:00Z',
			lastRefreshedAt: '2025-12-18T10:00:00Z',
			expiresAt: '2025-12-18T12:00:00Z',
			scopes: ['openid', 'profile', 'email', 'uxlint:api'],
			sessionId: 'sess_xyz789',
		},
	};

	await manager.saveSession(original);
	const loaded = await manager.loadSession();

	t.deepEqual(loaded, original);
});
