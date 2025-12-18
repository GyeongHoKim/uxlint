import test from 'ava';
import {isUserProfile} from '../../source/models/user-profile.js';

test('isUserProfile() returns true for valid user profile', t => {
	const profile = {
		id: 'user_123',
		email: 'user@example.com',
		name: 'Test User',
		organization: 'Example Org',
		picture: 'https://example.com/picture.png',
		emailVerified: true,
	};

	t.true(isUserProfile(profile));
});

test('isUserProfile() returns true when optional fields are missing', t => {
	const profile = {
		id: 'user_123',
		email: 'user@example.com',
		name: 'Test User',
	};

	t.true(isUserProfile(profile));
});

test('isUserProfile() returns false for invalid shapes', t => {
	t.false(isUserProfile(null));
	t.false(isUserProfile('nope'));
	t.false(isUserProfile({}));
	t.false(isUserProfile({id: 'x', email: 'y'}));
	t.false(isUserProfile({id: 'x', name: 'y'}));
	t.false(isUserProfile({email: 'x', name: 'y'}));
});
