import test from 'ava';
import {isPKCEParameters} from '../../source/models/pkce-params.js';

test('isPKCEParameters() returns true for valid params', t => {
	const parameters = {
		codeVerifier: 'a'.repeat(43),
		codeChallenge: 'b'.repeat(43),
		codeChallengeMethod: 'S256',
		state: 'state-123',
	};

	t.true(isPKCEParameters(parameters));
});

test('isPKCEParameters() returns false for invalid shapes', t => {
	t.false(isPKCEParameters(null));
	t.false(isPKCEParameters('nope'));
	t.false(isPKCEParameters({}));
	t.false(
		isPKCEParameters({
			codeVerifier: 'a'.repeat(43),
			codeChallenge: 'b'.repeat(43),
			codeChallengeMethod: 'plain',
			state: 'state',
		}),
	);
});
