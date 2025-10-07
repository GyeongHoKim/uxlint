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
			variant="default"
			value=""
			placeholder="Enter URL"
			theme={defaultTheme}
			onValueChange={mockHandlers.onChange}
			onSubmit={mockHandlers.onSubmit}
		/>,
	);

	const frame = lastFrame();
	t.snapshot(frame, 'user-input-normal-empty');
});

test('UserInput visual snapshot - normal state (with value)', t => {
	const {lastFrame} = render(
		<UserInput
			variant="default"
			value="https://example.com"
			theme={defaultTheme}
			onValueChange={mockHandlers.onChange}
			onSubmit={mockHandlers.onSubmit}
		/>,
	);

	const frame = lastFrame();
	t.snapshot(frame, 'user-input-normal-with-value');
});

test('UserInput visual snapshot - loading state', t => {
	const {lastFrame} = render(
		<UserInput
			variant="loading"
			loadingText="Validating URL..."
			theme={defaultTheme}
		/>,
	);

	const frame = lastFrame();
	t.snapshot(frame, 'user-input-loading-state');
});

test('UserInput visual snapshot - typing state', t => {
	const {lastFrame} = render(
		<UserInput
			variant="typing"
			value="https://exam"
			theme={defaultTheme}
			onValueChange={mockHandlers.onChange}
			onSubmit={mockHandlers.onSubmit}
		/>,
	);

	const frame = lastFrame();
	t.snapshot(frame, 'user-input-typing-state');
});

test('UserInput visual snapshot - error state', t => {
	const {lastFrame} = render(
		<UserInput
			variant="error"
			error="Please enter a valid URL"
			value="invalid-url"
			theme={defaultTheme}
			onValueChange={mockHandlers.onChange}
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
			variant="default"
			value="test"
			theme={defaultTheme}
			onValueChange={handleChange}
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
			variant="default"
			value=""
			theme={defaultTheme}
			onValueChange={mockHandlers.onChange}
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
