/**
 * One real round trip through the callback server.
 *
 * The unit tests next door cover what this class decides; none of them needs
 * a socket, and going through HTTP made three of its branches unreachable.
 * What they cannot cover is the assumption they freeze: that `getAuthCode`
 * still accepts these arguments and still binds a port a browser could reach.
 * A mock keeps agreeing with us after the library stops.
 *
 * So exactly one test here, and it asserts the part a mock cannot: that a
 * callback delivered over real HTTP, to a port found by probing rather than
 * guessed, comes back out as a result.
 */

import test from 'ava';
import {CallbackServer} from '../../source/infrastructure/auth/callback-server.js';
import {findListeningPort} from '../utils.js';

test('a real callback round-trips through a real port', async t => {
	// Three ports rather than a wide range: the fallback logic is covered by
	// unit tests, and the server waits its full timeout on each port before
	// moving on -- so a wide range turns any hiccup into a hang far longer
	// than the runner's patience, reported as a pending test rather than a
	// failing one.
	const ports = [9100, 9101, 9102];
	const server = new CallbackServer();

	const callbackPromise = server.waitForCallback({
		port: [9100, 9102],
		expectedState: 'round_trip_state',
		timeoutMs: 2000,
	});

	// Which port was taken is not knowable in advance, and sleeping a fixed
	// number of milliseconds and hoping is the race this file used to lose:
	// binding takes 36-48ms idle but 84-139ms under parallel load.
	const delivered = findListeningPort(ports).then(async port => {
		const response = await fetch(
			`http://localhost:${port}/callback?code=round_trip_code&state=round_trip_state`,
		);
		await response.text();
		return port;
	});

	const result = await callbackPromise;
	const port = await delivered;

	t.is(result.code, 'round_trip_code');
	t.is(result.state, 'round_trip_state');
	t.true(ports.includes(port));
});
