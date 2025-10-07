import test from 'ava';
import {render} from 'ink-testing-library';
import {UserInputLabel} from '../../source/components/user-input-label.js';
import {defaultTheme} from '../../source/models/theme.js';

// Visual Regression Tests for UserInputLabel Component

test('UserInputLabel visual snapshot - default variant', t => {
	const {lastFrame} = render(
		<UserInputLabel
			text="Default Label"
			variant="default"
			theme={defaultTheme}
		/>,
	);

	const frame = lastFrame();
	t.truthy(frame);
	t.true(frame!.includes('Default Label'));
	t.false(frame!.includes('*'));
	t.false(frame!.includes('(optional)'));
	t.snapshot(frame, 'user-input-label-default-variant');
});

test('UserInputLabel visual snapshot - required variant', t => {
	const {lastFrame} = render(
		<UserInputLabel
			text="Required Label"
			variant="required"
			theme={defaultTheme}
		/>,
	);

	const frame = lastFrame();
	t.truthy(frame);
	t.true(frame!.includes('Required Label *'));
	t.snapshot(frame, 'user-input-label-required-variant');
});

test('UserInputLabel visual snapshot - optional variant', t => {
	const {lastFrame} = render(
		<UserInputLabel
			text="Optional Label"
			variant="optional"
			theme={defaultTheme}
		/>,
	);

	const frame = lastFrame();
	t.truthy(frame);
	t.true(frame!.includes('Optional Label (optional)'));
	t.snapshot(frame, 'user-input-label-optional-variant');
});

// Theme Integration Tests

test('UserInputLabel custom theme integration', t => {
	const customTheme = {
		...defaultTheme,
		primary: '#ff0000',
		status: {
			...defaultTheme.status,
			error: '#ff6b6b',
		},
		text: {
			...defaultTheme.text,
			muted: '#cccccc',
		},
	};

	const {lastFrame: defaultFrame} = render(
		<UserInputLabel
			text="Custom Theme Default"
			variant="default"
			theme={customTheme}
		/>,
	);

	const {lastFrame: requiredFrame} = render(
		<UserInputLabel
			text="Custom Theme Required"
			variant="required"
			theme={customTheme}
		/>,
	);

	const {lastFrame: optionalFrame} = render(
		<UserInputLabel
			text="Custom Theme Optional"
			variant="optional"
			theme={customTheme}
		/>,
	);

	t.truthy(defaultFrame);
	t.truthy(requiredFrame);
	t.truthy(optionalFrame);
	t.snapshot(defaultFrame, 'user-input-label-custom-theme-default');
	t.snapshot(requiredFrame, 'user-input-label-custom-theme-required');
	t.snapshot(optionalFrame, 'user-input-label-custom-theme-optional');
});

// Behavior Tests

test('UserInputLabel renders without side effects', t => {
	let sideEffectCount = 0;

	// Mock function to detect side effects
	const originalConsoleLog = console.log;
	console.log = () => {
		sideEffectCount++;
	};

	render(
		<UserInputLabel
			text="Side Effect Test"
			variant="default"
			theme={defaultTheme}
		/>,
	);

	// Restore console.log
	console.log = originalConsoleLog;

	// Component should render without side effects
	t.is(sideEffectCount, 0);
});

test('UserInputLabel accepts all required props', t => {
	const {lastFrame} = render(
		<UserInputLabel text="Props Test" theme={defaultTheme} />,
	);

	const frame = lastFrame();
	t.truthy(frame);
	t.true(frame!.includes('Props Test'));
});

// Edge Cases

test('UserInputLabel handles empty text', t => {
	const {lastFrame} = render(
		<UserInputLabel text="" variant="required" theme={defaultTheme} />,
	);

	const frame = lastFrame();
	t.truthy(frame);
	t.true(frame!.includes('*')); // Should still show required indicator
});

test('UserInputLabel handles long text', t => {
	const longText =
		'This is a very long label text that might wrap or truncate in the terminal interface';

	const {lastFrame} = render(
		<UserInputLabel text={longText} variant="required" theme={defaultTheme} />,
	);

	const frame = lastFrame();
	t.truthy(frame);
	t.true(frame!.includes(longText.slice(0, 20))); // Check partial match
	t.true(frame!.includes('*')); // Should still show required indicator
	t.snapshot(frame, 'user-input-label-long-text');
});

test('UserInputLabel handles special characters', t => {
	const specialText = String.raw`Label with special chars: @#$%^&*()[]{}|\:";'<>?,./`;

	const {lastFrame} = render(
		<UserInputLabel
			text={specialText}
			theme={defaultTheme}
			variant="optional"
		/>,
	);

	const frame = lastFrame();
	t.truthy(frame);
	t.true(frame!.includes('(optional)'));
	t.snapshot(frame, 'user-input-label-special-characters');
});
