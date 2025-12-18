import test from 'ava';
import {
	AuthenticationError,
	AuthErrorCode,
} from '../../source/models/auth-error.js';
import {isUxlintError} from '../../source/models/errors.js';

test('AuthenticationError has correct name and code', t => {
	const error = new AuthenticationError(
		AuthErrorCode.NOT_AUTHENTICATED,
		'Not logged in',
	);

	t.is(error.name, 'AuthenticationError');
	t.is(error.code, AuthErrorCode.NOT_AUTHENTICATED);
	t.true(isUxlintError(error));
});
