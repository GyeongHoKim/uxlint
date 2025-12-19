import test from 'ava';
import type {TokenSet} from '../../source/models/token-set.js';

// T017: Unit tests for TokenSet model

test('TokenSet type allows all required fields', t => {
	const tokenSet: TokenSet = {
		accessToken: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
		tokenType: 'Bearer',
		expiresIn: 3600,
		refreshToken: 'v1.MR5h...',
		scope: 'openid profile email',
	};

	t.is(tokenSet.accessToken, 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...');
	t.is(tokenSet.tokenType, 'Bearer');
	t.is(tokenSet.expiresIn, 3600);
	t.is(tokenSet.refreshToken, 'v1.MR5h...');
	t.is(tokenSet.scope, 'openid profile email');
});

test('TokenSet type allows optional idToken field', t => {
	const tokenSet: TokenSet = {
		accessToken: 'access_123',
		tokenType: 'Bearer',
		expiresIn: 7200,
		refreshToken: 'refresh_456',
		idToken: 'eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9...',
		scope: 'openid profile',
	};

	t.is(tokenSet.idToken, 'eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9...');
});

test('TokenSet without idToken works correctly', t => {
	const tokenSet: TokenSet = {
		accessToken: 'access_without_id',
		tokenType: 'Bearer',
		expiresIn: 1800,
		refreshToken: 'refresh_without_id',
		scope: 'api:read api:write',
	};

	t.is(tokenSet.idToken, undefined);
});

test('TokenSet tokenType is always Bearer', t => {
	const tokenSet: TokenSet = {
		accessToken: 'token',
		tokenType: 'Bearer',
		expiresIn: 3600,
		refreshToken: 'refresh',
		scope: 'openid',
	};

	t.is(tokenSet.tokenType, 'Bearer');
});

test('TokenSet expiresIn is in seconds', t => {
	const tokenSet: TokenSet = {
		accessToken: 'token',
		tokenType: 'Bearer',
		expiresIn: 3600, // 1 hour in seconds
		refreshToken: 'refresh',
		scope: 'openid',
	};

	// Calculate expiry time
	const expiryMs = tokenSet.expiresIn * 1000;
	const expiryDate = new Date(Date.now() + expiryMs);

	// Should be approximately 1 hour from now
	const oneHourFromNow = new Date(Date.now() + 60 * 60 * 1000);
	const timeDiff = Math.abs(expiryDate.getTime() - oneHourFromNow.getTime());

	t.true(timeDiff < 1000); // Within 1 second tolerance
});

test('TokenSet can be serialized to JSON', t => {
	const tokenSet: TokenSet = {
		accessToken: 'access_json',
		tokenType: 'Bearer',
		expiresIn: 3600,
		refreshToken: 'refresh_json',
		idToken: 'id_json',
		scope: 'openid profile email uxlint:api',
	};

	const json = JSON.stringify(tokenSet);
	const parsed = JSON.parse(json) as TokenSet;

	t.deepEqual(parsed, tokenSet);
});

test('TokenSet scope can contain multiple scopes space-separated', t => {
	const tokenSet: TokenSet = {
		accessToken: 'token',
		tokenType: 'Bearer',
		expiresIn: 3600,
		refreshToken: 'refresh',
		scope: 'openid profile email uxlint:api offline_access',
	};

	const scopes = tokenSet.scope.split(' ');
	t.deepEqual(scopes, [
		'openid',
		'profile',
		'email',
		'uxlint:api',
		'offline_access',
	]);
});

test('TokenSet can parse OAuth token response format', t => {
	// Simulate OAuth token response (snake_case) to TokenSet (camelCase)
	const oauthResponse = {
		access_token: 'oauth_access',
		token_type: 'Bearer',
		expires_in: 3600,
		refresh_token: 'oauth_refresh',
		id_token: 'oauth_id',
		scope: 'openid profile',
	};

	const tokenSet: TokenSet = {
		accessToken: oauthResponse.access_token,
		tokenType: oauthResponse.token_type as 'Bearer',
		expiresIn: oauthResponse.expires_in,
		refreshToken: oauthResponse.refresh_token,
		idToken: oauthResponse.id_token,
		scope: oauthResponse.scope,
	};

	t.is(tokenSet.accessToken, 'oauth_access');
	t.is(tokenSet.refreshToken, 'oauth_refresh');
});
