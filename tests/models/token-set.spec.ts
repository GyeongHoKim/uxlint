import test from 'ava';
import {isTokenSet} from '../../source/models/token-set.js';

test('isTokenSet() returns true for valid token set', t => {
	const tokens = {
		accessToken: 'access',
		tokenType: 'Bearer',
		expiresIn: 3600,
		refreshToken: 'refresh',
		idToken: 'id.token',
		scope: 'openid profile email',
	};

	t.true(isTokenSet(tokens));
});

test('isTokenSet() returns true when optional fields are missing', t => {
	const tokens = {
		accessToken: 'access',
		tokenType: 'Bearer',
		expiresIn: 3600,
		refreshToken: 'refresh',
	};

	t.true(isTokenSet(tokens));
});

test('isTokenSet() returns false for invalid shapes', t => {
	t.false(isTokenSet(null));
	t.false(isTokenSet('nope'));
	t.false(isTokenSet({}));
	t.false(isTokenSet({accessToken: 'a'}));
	t.false(
		isTokenSet({
			accessToken: 'a',
			tokenType: 'Bearer',
			expiresIn: '3600',
			refreshToken: 'r',
		}),
	);
});
