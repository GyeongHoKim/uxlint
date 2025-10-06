import test from 'ava';
import {render} from 'ink-testing-library';
import {UserInput} from '../../source/components/user-input.js';
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

// Visual Regression Tests - 4 States
test('UserInput visual snapshot - normal state (empty)', t => {
	const {lastFrame} = render(
		<UserInput
			theme={defaultTheme}
			value=""
			onChange={mockHandlers.onChange}
			onSubmit={mockHandlers.onSubmit}
		/>,
	);

	const frame = lastFrame();
	t.snapshot(frame, 'user-input-normal-empty');
});

test('UserInput visual snapshot - normal state (with value)', t => {
	const {lastFrame} = render(
		<UserInput
			theme={defaultTheme}
			value="https://example.com"
			onChange={mockHandlers.onChange}
			onSubmit={mockHandlers.onSubmit}
		/>,
	);

	const frame = lastFrame();
	t.snapshot(frame, 'user-input-normal-with-value');
});

test('UserInput visual snapshot - loading state', t => {
	const {lastFrame} = render(
		<UserInput
			isLoading
			loadingText="Validating URL..."
			theme={defaultTheme}
			value="https://example.com"
			onChange={mockHandlers.onChange}
			onSubmit={mockHandlers.onSubmit}
		/>,
	);

	const frame = lastFrame();
	t.snapshot(frame, 'user-input-loading-state');
});

test('UserInput visual snapshot - typing state', t => {
	// Note: typing state is managed internally by useKeyboardInput
	// This test captures the visual state when user has typed something
	const {lastFrame} = render(
		<UserInput
			theme={defaultTheme}
			value="https://exam"
			onChange={mockHandlers.onChange}
			onSubmit={mockHandlers.onSubmit}
		/>,
	);

	const frame = lastFrame();
	t.snapshot(frame, 'user-input-typing-state');
});

test('UserInput visual snapshot - error state', t => {
	const {lastFrame} = render(
		<UserInput
			error="Please enter a valid URL"
			theme={defaultTheme}
			value="invalid-url"
			onChange={mockHandlers.onChange}
			onSubmit={mockHandlers.onSubmit}
		/>,
	);

	const frame = lastFrame();
	t.snapshot(frame, 'user-input-error-state');
});

// Behavior Tests
test('UserInput renders without calling handlers initially', t => {
	let changeCount = 0;
	let submitCount = 0;

	const handleChange = () => {
		changeCount++;
	};

	const handleSubmit = () => {
		submitCount++;
	};

	render(
		<UserInput
			theme={defaultTheme}
			value="test"
			onChange={handleChange}
			onSubmit={handleSubmit}
		/>,
	);

	// Component should render without calling handlers initially
	t.is(changeCount, 0);
	t.is(submitCount, 0);
});

test('UserInput accepts all required props', t => {
	const {lastFrame} = render(
		<UserInput
			theme={defaultTheme}
			value=""
			onChange={mockHandlers.onChange}
			onSubmit={mockHandlers.onSubmit}
		/>,
	);

	const frame = lastFrame();

	if (frame) {
		t.is(typeof frame, 'string');
		t.true(frame.length > 0);
	} else {
		t.fail('Frame should not be undefined');
	}
});
