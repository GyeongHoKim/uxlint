import process from 'node:process';
import {config as dotenvConfig} from 'dotenv';
import {Box, Text} from 'ink';
import {AnalysisRunner, ConfigWizard, Header} from './components/index.js';
import {
	UxlintMachineContext,
	matchesStatePath,
	useUxlintContext,
} from './contexts/uxlint-context.js';
import type {UxLintConfig} from './models/config.js';
import {defaultTheme} from './models/theme.js';

// Load environment variables from .env file
dotenvConfig();

/**
 * Main App component
 * Uses XState machine context to determine what to render
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
				<AnalysisRunner theme={defaultTheme} config={config} />
			</Box>
		);
	}

	// CI: AnalyzeWithoutUI state
	if (matchesStatePath(stateValue, 'ci.analyzeWithoutUI')) {
		const {config} = context;
		if (!config) {
			return (
				<Box flexDirection="column" gap={1}>
					<Text color="red">Error: No configuration available</Text>
				</Box>
			);
		}

		// Minimal UI for CI mode - just show that analysis is running
		return (
			<Box flexDirection="column" gap={1}>
				<Text>Running UX analysis...</Text>
				<AnalysisRunner theme={defaultTheme} config={config} />
			</Box>
		);
	}

	// CI: Error state
	if (matchesStatePath(stateValue, 'ci.error')) {
		const errorMessage =
			context.error?.message ?? 'Configuration file not found';
		return (
			<Box flexDirection="column" gap={1}>
				<Text color="red">Error: {errorMessage}</Text>
				<Text dimColor>
					Use --interactive flag to create a configuration file.
				</Text>
			</Box>
		);
	}

	// ReportBuilder state
	if (stateValue === 'reportBuilder') {
		return (
			<Box flexDirection="column" gap={1}>
				<Text color="green">Analysis complete!</Text>
				<Text>Generating report...</Text>
			</Box>
		);
	}

	// Done state
	if (stateValue === 'done') {
		if (context.exitCode === 0) {
			process.exit(0);
		} else {
			process.exit(1);
		}

		return null;
	}

	// Loading/Checking states
	return (
		<Box flexDirection="column" gap={1}>
			<Header theme={defaultTheme} />
			<Text color="yellow">Initializing...</Text>
		</Box>
	);
}
