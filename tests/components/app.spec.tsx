import test from 'ava';
import {render} from 'ink-testing-library';
import React from 'react';
import App from '../../source/app.js';
import {UxlintMachineContext} from '../../source/components/providers/uxlint-machine-context.js';
import {BrowserPreflightError} from '../../source/models/errors.js';

/**
 * Drive the app to its terminal state carrying an error.
 *
 * The machine records the error and moves to `done` on ANALYSIS_ERROR, which
 * is the path a preflight failure takes.
 */
const renderWithAnalysisError = (error: Error) => {
	function Harness() {
		const actorRef = UxlintMachineContext.useActorRef();

		React.useEffect(() => {
			actorRef.send({type: 'ANALYSIS_ERROR', error});
		}, [actorRef]);

		return <App />;
	}

	return render(
		<UxlintMachineContext.Provider
			options={{input: {interactive: true, configExists: true}}}
		>
			<Harness />
		</UxlintMachineContext.Provider>,
	);
};

test('preflight guidance reaches the interactive UI, not just the exit code', t => {
	const guidance =
		'No usable Chrome was found. Searched: /opt/google/chrome/chrome. Install Google Chrome.';

	const {lastFrame, unmount} = renderWithAnalysisError(
		new BrowserPreflightError(guidance),
	);

	const output = lastFrame() ?? '';

	// Before this, the done state rendered only "Completed with errors" and
	// discarded the message, so a user whose image was missing a browser was
	// told that something went wrong and nothing about what to do.
	t.true(
		output.includes('/opt/google/chrome/chrome'),
		'the searched path must reach the user',
	);
	t.regex(output, /install/i, 'the remedy must reach the user');

	unmount();
});

test('a failed run still reports its failure verdict alongside the reason', t => {
	const {lastFrame, unmount} = renderWithAnalysisError(
		new BrowserPreflightError('anything'),
	);

	t.regex(lastFrame() ?? '', /Completed with errors/);

	unmount();
});

test('the rendered guidance is a message rather than a stack trace', t => {
	const error = new BrowserPreflightError('No usable Chrome was found.');

	const {lastFrame, unmount} = renderWithAnalysisError(error);
	const output = lastFrame() ?? '';

	t.false(output.includes('at Object.'), 'no stack frames belong on screen');
	t.false(output.includes('.ts:'), 'no source locations belong on screen');

	unmount();
});
