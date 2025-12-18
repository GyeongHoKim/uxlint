import test from 'ava';
import {render} from 'ink-testing-library';
import {
	AuthStatus,
	type AuthStatusClient,
} from '../../../source/components/auth/auth-status.js';

const loggedOutClient: AuthStatusClient = {
	async getStatus() {
		return undefined;
	},
};

test('AuthStatus shows not logged in message', async t => {
	const {lastFrame, unmount} = render(<AuthStatus client={loggedOutClient} />);

	// Allow useEffect to run
	await new Promise<void>(resolve => {
		setTimeout(resolve, 0);
	});

	const output = lastFrame();
	unmount();

	t.truthy(output);
	t.true(output?.includes('Not logged in'));
});
