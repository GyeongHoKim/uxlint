import test from 'ava';
import {render} from 'ink-testing-library';
import {
	LoginFlow,
	type LoginFlowClient,
} from '../../../source/components/auth/login-flow.js';

const client: LoginFlowClient = {
	async login() {
		// Keep pending; we only snapshot initial frame.
		await new Promise<void>(() => {
			// Noop
		});
	},
};

const noop = () => {
	// Noop
};

test('LoginFlow renders opening browser spinner initially', t => {
	const {lastFrame, unmount} = render(
		<LoginFlow client={client} onComplete={noop} onError={noop} />,
	);

	const output = lastFrame();
	unmount();

	t.truthy(output);
	t.true(output?.includes('Opening browser'));
});
