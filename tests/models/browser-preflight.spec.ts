import test from 'ava';
import {
	classifyLaunchFailure,
	describeUnmetRequirement,
	parseChromeMajorVersion,
	rootSandboxSignature,
	namespaceSandboxSignature,
} from '../../source/models/browser-preflight.js';

test('an absent browser names the paths searched and how to install one', t => {
	const message = describeUnmetRequirement({
		kind: 'browser-absent',
		searchedPaths: ['/opt/google/chrome/chrome'],
	});

	t.true(message.includes('/opt/google/chrome/chrome'));
	t.regex(message, /install/i);
});

test('an absent browser at a configured path reads as a bad setting', t => {
	const message = describeUnmetRequirement({
		kind: 'browser-absent',
		searchedPaths: ['/custom/chrome'],
		configuredPath: '/custom/chrome',
	});

	// The remedy differs from "install a browser", so the message must not
	// send the user off to download one they already have.
	t.regex(message, /configur/i);
	t.true(message.includes('/custom/chrome'));
});

test('an unstartable browser message admits age as a possible cause', t => {
	// There is no version floor to report against, so the message has to leave
	// room for "too old to drive" without inventing a number to compare with.
	const message = describeUnmetRequirement({
		kind: 'browser-unstartable',
		cause: 'Segmentation fault',
	});

	t.regex(message, /old/i);
	t.regex(message, /environment/i);
});

test('an unstartable browser reproduces the browser own explanation', t => {
	const message = describeUnmetRequirement({
		kind: 'browser-unstartable',
		cause: 'error while loading shared libraries: libnss3.so',
	});

	t.true(message.includes('libnss3.so'));
});

test('the root sandbox signature is recognised', t => {
	const outcome = classifyLaunchFailure(rootSandboxSignature);

	t.is(outcome.kind, 'sandbox-unavailable');
});

test('the namespace sandbox signature is recognised', t => {
	const outcome = classifyLaunchFailure(namespaceSandboxSignature);

	t.is(outcome.kind, 'sandbox-unavailable');
});

test('an unrecognised failure is never treated as a sandbox failure', t => {
	// Guessing "probably the sandbox" would silently disable a browser
	// security protection in response to an unrelated fault.
	const outcome = classifyLaunchFailure(
		'error while loading shared libraries: libnss3.so: cannot open shared object file',
	);

	t.is(outcome.kind, 'unstartable');
});

test('an empty failure message is unstartable, not a sandbox failure', t => {
	t.is(classifyLaunchFailure('').kind, 'unstartable');
});

test('the major version is parsed from the browser version banner', t => {
	t.is(parseChromeMajorVersion('Google Chrome 151.0.7922.137'), 151);
	t.is(parseChromeMajorVersion('Chromium 124.0.6367.78 Alpine Linux'), 124);
	t.is(parseChromeMajorVersion('not a version banner'), undefined);
});

test('the disclosed cause is the sandbox error, not the warning that precedes it', t => {
	// Verbatim from a real root container. Chrome opens with a WARNING about
	// its channel file before it gets to the sentence that matters; reporting
	// line one disclosed that warning as the reason the sandbox was relaxed,
	// which is noise presented as a cause.
	const stderr = [
		'[0815/072854.290380:WARNING:chrome/app/chrome_main_linux.cc:84] Read channel stable from /opt/google/chrome/CHROME_VERSION_EXTRA',
		'[14:14:0815/072854.836423:ERROR:content/browser/zygote_host/zygote_host_impl_linux.cc:101] Running as root without --no-sandbox is not supported. See https://crbug.com/638180.',
	].join('\n');

	const outcome = classifyLaunchFailure(stderr);

	t.is(outcome.kind, 'sandbox-unavailable');
	t.true(outcome.cause.includes('--no-sandbox'));
	t.false(outcome.cause.includes('CHROME_VERSION_EXTRA'));
});

test('an unstartable browser prefers its error line over a leading warning', t => {
	const stderr = [
		'[0815/072854.290380:WARNING:chrome/app/chrome_main_linux.cc:84] Read channel stable',
		'[0815/072854.836423:ERROR:something.cc:1] error while loading shared libraries: libnss3.so',
	].join('\n');

	const outcome = classifyLaunchFailure(stderr);

	t.is(outcome.kind, 'unstartable');
	t.true(outcome.cause.includes('libnss3.so'));
});
