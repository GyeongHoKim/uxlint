import {Text} from 'ink';
import {render} from 'ink-testing-library';
import {PromptStep} from '../../source/components/prompt-step.js';
import {defaultTheme} from '../../source/models/theme.js';

test('PromptStep visual snapshot - required step', () => {
	const {lastFrame} = render(
		<PromptStep
			isRequired
			stepNumber={1}
			totalSteps={7}
			label="Enter main page URL"
			theme={defaultTheme}
		>
			<Text>https://example.com</Text>
		</PromptStep>,
	);

	const frame = lastFrame();
	expect(frame).toMatchSnapshot('prompt-step-required');
});

test('PromptStep visual snapshot - optional step', () => {
	const {lastFrame} = render(
		<PromptStep
			stepNumber={3}
			totalSteps={7}
			label="Add sub-page URL (optional)"
			isRequired={false}
			theme={defaultTheme}
		>
			<Text>https://example.com/about</Text>
		</PromptStep>,
	);

	const frame = lastFrame();
	expect(frame).toMatchSnapshot('prompt-step-optional');
});

test('PromptStep visual snapshot - last step', () => {
	const {lastFrame} = render(
		<PromptStep
			isRequired
			stepNumber={7}
			totalSteps={7}
			label="Review configuration"
			theme={defaultTheme}
		>
			<Text>Configuration ready</Text>
		</PromptStep>,
	);

	const frame = lastFrame();
	expect(frame).toMatchSnapshot('prompt-step-last');
});
