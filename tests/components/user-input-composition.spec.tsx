import test from 'ava';
import {render} from 'ink-testing-library';
import {Box} from 'ink';
import {UserInput, UserInputLabel} from '../../source/components/index.js';
import {defaultTheme} from '../../source/models/theme.js';

// Mock handlers for testing
const mockHandlers = {
	onChange() {
		// Mock implementation
	},
	onSubmit() {
		// Mock implementation
	},
};

// Visual Regression Tests for UserInput + UserInputLabel Composition

test('UserInput + UserInputLabel composition - default variant with default label', t => {
	const {lastFrame} = render(
		<Box flexDirection="column" gap={1}>
			<UserInputLabel
				text="Website URL"
				theme={defaultTheme}
				variant="default"
			/>
			<UserInput
				placeholder="Enter website URL"
				theme={defaultTheme}
				value=""
				variant="default"
				onSubmit={mockHandlers.onSubmit}
				onValueChange={mockHandlers.onChange}
			/>
		</Box>,
	);

	const frame = lastFrame();
	t.truthy(frame);
	t.true(frame!.includes('Website URL'));
	t.true(frame!.includes('Enter website URL'));
	t.snapshot(frame, 'composition-default-variant-default-label');
});

test('UserInput + UserInputLabel composition - default variant with required label', t => {
	const {lastFrame} = render(
		<Box flexDirection="column" gap={1}>
			<UserInputLabel
				text="Website URL"
				theme={defaultTheme}
				variant="required"
			/>
			<UserInput
				theme={defaultTheme}
				value="https://example.com"
				variant="default"
				onSubmit={mockHandlers.onSubmit}
				onValueChange={mockHandlers.onChange}
			/>
		</Box>,
	);

	const frame = lastFrame();
	t.truthy(frame);
	t.true(frame!.includes('Website URL *'));
	t.true(frame!.includes('https://example.com'));
	t.snapshot(frame, 'composition-default-variant-required-label');
});

test('UserInput + UserInputLabel composition - typing variant with required label', t => {
	const {lastFrame} = render(
		<Box flexDirection="column" gap={1}>
			<UserInputLabel
				text="Website URL"
				theme={defaultTheme}
				variant="required"
			/>
			<UserInput
				placeholder="Enter website URL"
				theme={defaultTheme}
				value="https://exam"
				variant="typing"
				onSubmit={mockHandlers.onSubmit}
				onValueChange={mockHandlers.onChange}
			/>
		</Box>,
	);

	const frame = lastFrame();
	t.truthy(frame);
	t.true(frame!.includes('Website URL *'));
	t.true(frame!.includes('https://exam'));
	t.true(frame!.includes('Press Enter to submit'));
	t.snapshot(frame, 'composition-typing-variant-required-label');
});

test('UserInput + UserInputLabel composition - loading variant with default label', t => {
	const {lastFrame} = render(
		<Box flexDirection="column" gap={1}>
			<UserInputLabel
				text="Validation Status"
				theme={defaultTheme}
				variant="default"
			/>
			<UserInput
				loadingText="Validating URL..."
				theme={defaultTheme}
				variant="loading"
			/>
		</Box>,
	);

	const frame = lastFrame();
	t.truthy(frame);
	t.true(frame!.includes('Validation Status'));
	t.true(frame!.includes('Validating URL...'));
	t.snapshot(frame, 'composition-loading-variant-default-label');
});

test('UserInput + UserInputLabel composition - error variant with required label', t => {
	const {lastFrame} = render(
		<Box flexDirection="column" gap={1}>
			<UserInputLabel
				text="Website URL"
				theme={defaultTheme}
				variant="required"
			/>
			<UserInput
				error="Please enter a valid URL"
				placeholder="Enter website URL"
				theme={defaultTheme}
				value="invalid-url"
				variant="error"
				onSubmit={mockHandlers.onSubmit}
				onValueChange={mockHandlers.onChange}
			/>
		</Box>,
	);

	const frame = lastFrame();
	t.truthy(frame);
	t.true(frame!.includes('Website URL *'));
	t.true(frame!.includes('invalid-url'));
	t.true(frame!.includes('✗ Please enter a valid URL'));
	t.snapshot(frame, 'composition-error-variant-required-label');
});

// Theme Consistency Tests

test('UserInput + UserInputLabel composition - custom theme consistency', t => {
	const customTheme = {
		...defaultTheme,
		primary: '#00ff00',
		status: {
			...defaultTheme.status,
			error: '#ff0000',
		},
		text: {
			...defaultTheme.text,
			primary: '#ffffff',
			muted: '#888888',
		},
	};

	const {lastFrame} = render(
		<Box flexDirection="column" gap={1}>
			<UserInputLabel
				text="Custom Theme Test"
				theme={customTheme}
				variant="required"
			/>
			<UserInput
				error="Custom themed error message"
				theme={customTheme}
				value="test-value"
				variant="error"
				onSubmit={mockHandlers.onSubmit}
				onValueChange={mockHandlers.onChange}
			/>
		</Box>,
	);

	const frame = lastFrame();
	t.truthy(frame);
	t.true(frame!.includes('Custom Theme Test *'));
	t.true(frame!.includes('test-value'));
	t.true(frame!.includes('✗ Custom themed error message'));
	t.snapshot(frame, 'composition-custom-theme-consistency');
});

// Accessibility and Ink Compatibility Tests

test('UserInput + UserInputLabel composition - accessibility features', t => {
	const {lastFrame} = render(
		<Box flexDirection="column" gap={1}>
			<UserInputLabel
				text="Accessible Input"
				theme={defaultTheme}
				variant="required"
			/>
			<UserInput
				error="This field is required for accessibility"
				placeholder="Enter required value"
				theme={defaultTheme}
				value=""
				variant="error"
				onSubmit={mockHandlers.onSubmit}
				onValueChange={mockHandlers.onChange}
			/>
		</Box>,
	);

	const frame = lastFrame();
	t.truthy(frame);
	// Check for accessibility indicators
	t.true(frame!.includes('*')); // Required indicator
	t.true(frame!.includes('✗')); // Error indicator
	t.true(frame!.includes('This field is required for accessibility'));
	t.snapshot(frame, 'composition-accessibility-features');
});

test('UserInput + UserInputLabel composition - Ink rendering compatibility', t => {
	const {lastFrame} = render(
		<Box
			borderColor="blue"
			borderStyle="round"
			flexDirection="column"
			gap={1}
			padding={1}
		>
			<UserInputLabel
				text="Terminal Compatibility Test"
				theme={defaultTheme}
				variant="default"
			/>
			<UserInput
				loadingText="Testing terminal rendering..."
				theme={defaultTheme}
				variant="loading"
			/>
		</Box>,
	);

	const frame = lastFrame();
	t.truthy(frame);
	t.true(frame!.includes('Terminal Compatibility Test'));
	t.true(frame!.includes('Testing terminal rendering...'));
	t.snapshot(frame, 'composition-ink-rendering-compatibility');
});
