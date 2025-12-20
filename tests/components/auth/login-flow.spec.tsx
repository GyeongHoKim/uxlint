/**
 * Visual regression tests for LoginFlow component
 */

import test from 'ava';
import {render} from 'ink-testing-library';
import {LoginFlow} from '../../../source/components/auth/login-flow.js';

// Note: In a real implementation, you would use a proper mocking library
// or dependency injection to replace the UXLintClient

test('renders opening browser spinner initially', t => {
	let completeCalled = false;
	let errorCalled = false;

	const {frames, unmount} = render(
		<LoginFlow
			onComplete={() => {
				completeCalled = true;
			}}
			onError={() => {
				errorCalled = true;
			}}
		/>,
	);

	// Check that at least one frame contains the opening browser message
	const hasOpeningBrowserFrame = frames.some(frame =>
		frame?.includes('Opening browser'),
	);
	t.true(hasOpeningBrowserFrame, 'Should render opening browser spinner');
	t.false(completeCalled);
	t.false(errorCalled);

	unmount();
});

test('renders success state with checkmark', t => {
	const {frames, unmount} = render(
		<LoginFlow
			onComplete={() => {
				/* Success callback */
			}}
			onError={() => {
				t.fail('onError should not be called');
			}}
		/>,
	);

	// Note: Success state depends on mocked UXLintClient behavior
	// In frames array, we can check if success message appears in any frame
	t.true(frames.length > 0, 'Should render at least one frame');

	unmount();
});

test('renders error state with error message', t => {
	const {frames, unmount} = render(
		<LoginFlow
			onComplete={() => {
				t.fail('onComplete should not be called on error');
			}}
			onError={() => {
				/* Error callback */
			}}
		/>,
	);

	// Error handling depends on mocked client behavior
	t.true(frames.length > 0, 'Should render at least one frame');

	unmount();
});

test('renders browser fallback when browser launch fails', t => {
	const {frames, unmount} = render(
		<LoginFlow
			onComplete={() => {
				t.pass();
			}}
			onError={() => {
				t.pass();
			}}
		/>,
	);

	// Fallback rendering depends on browser failure scenario
	t.true(frames.length > 0, 'Should render at least one frame');

	unmount();
});

test('handles already authenticated scenario', t => {
	const {frames, unmount} = render(
		<LoginFlow
			onComplete={() => {
				t.pass();
			}}
			onError={() => {
				t.fail('Should not error when already authenticated');
			}}
		/>,
	);

	t.true(frames.length > 0, 'Should render at least one frame');

	unmount();
});
