import test from 'ava';
import type {UserProfile} from '../../source/models/user-profile.js';

// T015: Unit tests for UserProfile model

test('UserProfile type allows all required fields', t => {
	const profile: UserProfile = {
		id: 'user_123',
		email: 'test@example.com',
		name: 'Test User',
		emailVerified: true,
	};

	t.is(profile.id, 'user_123');
	t.is(profile.email, 'test@example.com');
	t.is(profile.name, 'Test User');
	t.true(profile.emailVerified);
});

test('UserProfile type allows optional organization field', t => {
	const profile: UserProfile = {
		id: 'user_123',
		email: 'test@example.com',
		name: 'Test User',
		organization: 'Acme Corp',
		emailVerified: true,
	};

	t.is(profile.organization, 'Acme Corp');
});

test('UserProfile type allows optional picture field', t => {
	const profile: UserProfile = {
		id: 'user_123',
		email: 'test@example.com',
		name: 'Test User',
		picture: 'https://example.com/avatar.png',
		emailVerified: true,
	};

	t.is(profile.picture, 'https://example.com/avatar.png');
});

test('UserProfile type allows all optional fields together', t => {
	const profile: UserProfile = {
		id: 'user_456',
		email: 'developer@company.com',
		name: 'Jane Developer',
		organization: 'Company Inc',
		picture: 'https://cdn.example.com/jane.jpg',
		emailVerified: false,
	};

	t.is(profile.id, 'user_456');
	t.is(profile.email, 'developer@company.com');
	t.is(profile.name, 'Jane Developer');
	t.is(profile.organization, 'Company Inc');
	t.is(profile.picture, 'https://cdn.example.com/jane.jpg');
	t.false(profile.emailVerified);
});

test('UserProfile without optional fields works correctly', t => {
	const profile: UserProfile = {
		id: 'minimal_user',
		email: 'minimal@test.com',
		name: 'Minimal',
		emailVerified: true,
	};

	t.is(profile.organization, undefined);
	t.is(profile.picture, undefined);
});

test('UserProfile can be serialized to JSON', t => {
	const profile: UserProfile = {
		id: 'user_json',
		email: 'json@test.com',
		name: 'JSON User',
		organization: 'JSON Corp',
		emailVerified: true,
	};

	const json = JSON.stringify(profile);
	const parsed = JSON.parse(json) as UserProfile;

	t.deepEqual(parsed, profile);
});

test('UserProfile can be parsed from OIDC claims', t => {
	// Simulate parsing from OIDC ID token claims
	const claims = {
		sub: 'oidc_user_123',
		email: 'oidc@example.com',
		name: 'OIDC User',
		org: 'OIDC Organization',
		picture: 'https://oidc.example.com/pic.png',
		email_verified: true,
	};

	const profile: UserProfile = {
		id: claims.sub,
		email: claims.email,
		name: claims.name,
		organization: claims.org,
		picture: claims.picture,
		emailVerified: claims.email_verified,
	};

	t.is(profile.id, 'oidc_user_123');
	t.is(profile.organization, 'OIDC Organization');
});
