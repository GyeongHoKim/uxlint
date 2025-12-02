import process from 'node:process';
import {config as dotenvConfig} from 'dotenv';
import {Box, Text} from 'ink';
import {useEffect} from 'react';
import {
	AnalysisRunner,
	ConfigWizard,
	Header,
	ReportBuilder,
} from './components/index.js';
import {
	UxlintMachineContext,
	matchesStatePath,
	useUxlintContext,
} from './contexts/uxlint-context.js';
import type {UxReport} from './machines/uxlint-machine.js';
import type {UxLintConfig} from './models/config.js';
import {defaultTheme} from './models/theme.js';

// Load environment variables from .env file
dotenvConfig();

/**
 * Main App component (Interactive mode only)
 * Uses XState machine context to determine what to render
 * CI mode is handled by ci-runner.ts without using Ink
 */
export default function App() {
	const stateValue = UxlintMachineContext.useSelector(state => state.value);
	const context = useUxlintContext();
	const actorRef = UxlintMachineContext.useActorRef();

	// Handle wizard completion
	const handleWizardComplete = (config: UxLintConfig) => {
		actorRef.send({type: 'WIZARD_COMPLETE', config});
	};

	// Handle wizard cancellation
	const handleWizardCancel = () => {
		actorRef.send({type: 'WIZARD_CANCEL'});
	};

	// Handle process exit when done state is reached
	// Using useEffect to avoid triggering updates during render
	useEffect(() => {
		if (stateValue === 'done') {
			// Small delay to ensure UI updates are complete
			const timer = setTimeout(() => {
				process.exit(context.exitCode === 0 ? 0 : 1);
			}, 100);
			return () => {
				clearTimeout(timer);
			};
		}

		return undefined;
	}, [stateValue, context.exitCode]);

	// Render based on current state

	// TTY: Wizard state
	if (matchesStatePath(stateValue, 'tty.wizard')) {
		return (
			<ConfigWizard
				theme={defaultTheme}
				onComplete={handleWizardComplete}
				onCancel={handleWizardCancel}
			/>
		);
	}

	// TTY: AnalyzeWithUI state
	if (matchesStatePath(stateValue, 'tty.analyzeWithUI')) {
		const config = context.config ?? context.wizardConfig;
		if (!config) {
			return (
				<Box flexDirection="column" gap={1}>
					<Header theme={defaultTheme} />
					<Text color="red">Error: No configuration available</Text>
				</Box>
			);
		}

		return (
			<Box flexDirection="column" gap={1}>
				<Header theme={defaultTheme} />
				<AnalysisRunner
					theme={defaultTheme}
					config={config}
					onComplete={(result: UxReport) => {
						actorRef.send({type: 'ANALYSIS_COMPLETE', result});
					}}
					onError={(error: Error) => {
						actorRef.send({type: 'ANALYSIS_ERROR', error});
					}}
				/>
			</Box>
		);
	}

	// ReportBuilder state
	if (stateValue === 'reportBuilder') {
		return (
			<ReportBuilder
				theme={defaultTheme}
				onComplete={() => {
					actorRef.send({type: 'REPORT_COMPLETE'});
				}}
				onError={error => {
					actorRef.send({type: 'REPORT_ERROR', error});
				}}
			/>
		);
	}

	// Done state - show completion message while waiting for exit
	if (stateValue === 'done') {
		return (
			<Box flexDirection="column" gap={1}>
				<Text color={context.exitCode === 0 ? 'green' : 'red'}>
					{context.exitCode === 0 ? '✓ Done!' : '✗ Completed with errors'}
				</Text>
			</Box>
		);
	}

	// Loading/Checking states
	return (
		<Box flexDirection="column" gap={1}>
			<Header theme={defaultTheme} />
			<Text color="yellow">Initializing...</Text>
		</Box>
	);
}
