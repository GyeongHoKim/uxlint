import test from 'ava';
import {
	MissingConfigError,
	isUxlintError,
	isErrorOfType,
} from '../../dist/models/errors.js';

// T006: Test for MissingConfigError
test('MissingConfigError has correct message', t => {
	const error = new MissingConfigError();

	t.true(error.message.includes('Configuration file not found'));
	t.true(error.message.includes('--interactive'));
	t.true(error.message.includes('.uxlintrc'));
});

test('MissingConfigError has correct name', t => {
	const error = new MissingConfigError();

	t.is(error.name, 'MissingConfigError');
});

test('MissingConfigError has correct code', t => {
	const error = new MissingConfigError();

	t.is(error.code, 'MISSING_CONFIG_ERROR');
});

test('MissingConfigError is instance of UxlintError', t => {
	const error = new MissingConfigError();

	t.true(isUxlintError(error));
});

test('MissingConfigError can be type checked with isErrorOfType', t => {
	const error = new MissingConfigError();

	t.true(isErrorOfType(error, MissingConfigError));
});
