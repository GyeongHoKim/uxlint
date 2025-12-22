/**
 * ConfigWizard component - Main wizard container
 * Orchestrates the interactive configuration flow through all wizard phases
 */

import {ConfirmInput, Select} from '@inkjs/ui';
import {Box, Text} from 'ink';
import {useEffect, useState} from 'react';
import {useConfigWizard} from '../hooks/use-config-wizard.js';
import {configIO} from '../infrastructure/config/config-io.js';
import {buildConfig} from '../models/config-builder.js';
import type {ThemeConfig, UxLintConfig} from '../models/index.js';
import type {WizardState} from '../models/wizard-state.js';
import {ConfigSummary} from './config-summary.js';
import {Header} from './header.js';
import {PromptStep} from './prompt-step.js';
import {UserInput} from './user-input.js';

/**
 * Props for the ConfigWizard component
 */
export type ConfigWizardProps = {
	readonly theme: ThemeConfig;
	readonly onComplete: (config: UxLintConfig) => void;
	readonly onCancel: () => void;
};

/**
 * Sub URLs phase component
 */
function SubUrlsPhase({
	theme,
	state,
	currentInput,
	setCurrentInput,
	error,
	validateAndAddSubUrl,
	setCurrentUrlIndex,
}: {
	readonly theme: ThemeConfig;
	readonly state: Extract<WizardState, {phase: 'sub-urls'}>;
	readonly currentInput: string;
	readonly setCurrentInput: (value: string) => void;
	readonly error: Error | undefined;
	readonly validateAndAddSubUrl: (value: string) => boolean;
	readonly setCurrentUrlIndex: (index: number) => void;
}) {
	const handleAddUrl = (value: string) => {
		if (validateAndAddSubUrl(value)) {
			setCurrentUrlIndex(0);
		}
	};

	return (
		<Box flexDirection="column">
			<Header theme={theme} />
			<Box flexDirection="column" gap={1}>
				<PromptStep
					stepNumber={2}
					totalSteps={7}
					label="Add additional pages to analyze"
					isRequired={false}
					theme={theme}
				>
					<Box flexDirection="column" gap={1}>
						{/* Show current sub URLs */}
						{state.data.subPageUrls.length > 0 && (
							<Box flexDirection="column" marginBottom={1}>
								<Text color={theme.text.secondary}>
									Added pages ({state.data.subPageUrls.length}):
								</Text>
								{state.data.subPageUrls.map((url: string) => (
									<Text key={url} color={theme.text.primary}>
										• {url}
									</Text>
								))}
							</Box>
						)}

						<UserInput
							error={error}
							placeholder="https://example.com/about"
							theme={theme}
							value={currentInput}
							variant={error ? 'error' : 'default'}
							onChange={setCurrentInput}
							onSubmit={handleAddUrl}
						/>

						<Box marginTop={1}>
							<Text color={theme.text.muted}>
								Press Enter with empty input when done
							</Text>
						</Box>
					</Box>
				</PromptStep>
			</Box>
		</Box>
	);
}

/**
 * Persona phase component
 */
function PersonaPhase({
	theme,
	state: _state,
	currentInput,
	setCurrentInput,
	error,
	validateAndSetPersona,
}: {
	readonly theme: ThemeConfig;
	readonly state: Extract<WizardState, {phase: 'persona'}>;
	readonly currentInput: string;
	readonly setCurrentInput: (value: string) => void;
	readonly error: Error | undefined;
	readonly validateAndSetPersona: (value: string) => boolean;
}) {
	const handleSetPersona = (value: string) => {
		validateAndSetPersona(value);
	};

	return (
		<Box flexDirection="column">
			<Header theme={theme} />
			<PromptStep
				stepNumber={4}
				totalSteps={7}
				label="Add user persona (required)"
				theme={theme}
			>
				<Box flexDirection="column" gap={1}>
					<UserInput
						error={error}
						placeholder="e.g., Developer using CLI tools, needs quick setup, keyboard shortcuts"
						theme={theme}
						value={currentInput}
						variant={error ? 'error' : 'default'}
						onChange={setCurrentInput}
						onSubmit={handleSetPersona}
					/>

					<Box marginTop={1}>
						<Text color={theme.text.muted}>
							Describe user goals, constraints, devices, accessibility needs
							(min 20 chars)
						</Text>
					</Box>
				</Box>
			</PromptStep>
		</Box>
	);
}

/**
 * Save phase component
 */
function SavePhase({
	theme,
	state,
	dispatch,
	onComplete,
	setError,
	setIsLoading,
	isLoading,
	error,
}: {
	readonly theme: ThemeConfig;
	readonly state: Extract<WizardState, {phase: 'save'}>;
	readonly dispatch: ReturnType<typeof useConfigWizard>['dispatch'];
	readonly onComplete: (config: UxLintConfig) => void;
	readonly setError: (error: Error | undefined) => void;
	readonly setIsLoading: (loading: boolean) => void;
	readonly isLoading: boolean;
	readonly error: Error | undefined;
}) {
	const [shouldSave, setShouldSave] = useState<boolean | undefined>();
	const [selectedFormat, setSelectedFormat] = useState<'yaml' | 'json'>('yaml');
	const [formatSelected, setFormatSelected] = useState(false);

	// Handle save when format is confirmed via effect
	useEffect(() => {
		if (formatSelected && !isLoading) {
			const performSave = async () => {
				setIsLoading(true);
				const config = buildConfig(state.data);

				try {
					const filePath = await configIO.saveConfigToFile(config, {
						shouldSave: true,
						format: selectedFormat,
					});

					setIsLoading(false);
					dispatch({
						type: 'SET_SAVE_OPTIONS',
						payload: {
							shouldSave: true,
							format: selectedFormat,
							filePath,
						},
					});
					dispatch({type: 'COMPLETE_WIZARD'});
				} catch (error_: unknown) {
					setIsLoading(false);
					setError(
						error_ instanceof Error ? error_ : new Error(String(error_)),
					);
				}
			};

			void performSave();
		}
	}, [
		formatSelected,
		isLoading,
		selectedFormat,
		state.data,
		dispatch,
		setIsLoading,
		setError,
	]);

	if (shouldSave === undefined) {
		return (
			<Box flexDirection="column">
				<Header theme={theme} />
				<Box flexDirection="column" gap={1}>
					<Text bold color={theme.primary}>
						Save Configuration
					</Text>
					<Text color={theme.text.secondary}>
						Would you like to save this configuration to a file?
					</Text>
					<Text color={theme.text.muted}>Press Y to save, N to skip</Text>
					<ConfirmInput
						defaultChoice="confirm"
						onCancel={() => {
							// Skip saving, complete wizard
							setShouldSave(false);
							const config = buildConfig(state.data);
							onComplete(config);
						}}
						onConfirm={() => {
							setShouldSave(true);
						}}
					/>
				</Box>
			</Box>
		);
	}

	if (shouldSave && !formatSelected) {
		return (
			<Box flexDirection="column">
				<Header theme={theme} />
				<Box flexDirection="column" gap={1}>
					<Text bold color={theme.primary}>
						Choose format
					</Text>
					<Text color={theme.text.secondary}>
						Select the file format for your configuration:
					</Text>
					<Box flexDirection="column" gap={1}>
						<Select
							defaultValue="yaml"
							options={[
								{label: 'YAML (recommended, human-readable)', value: 'yaml'},
								{label: 'JSON (machine-friendly)', value: 'json'},
							]}
							onChange={(selectedValue: string) => {
								const format = selectedValue as 'yaml' | 'json';
								setSelectedFormat(format);
							}}
						/>
						<Text color={theme.text.muted}>
							Press Enter to confirm and save
						</Text>
						<ConfirmInput
							defaultChoice="confirm"
							onCancel={() => {
								// Go back or skip
								setShouldSave(false);
								const config = buildConfig(state.data);
								onComplete(config);
							}}
							onConfirm={() => {
								setFormatSelected(true);
							}}
						/>
					</Box>
				</Box>
			</Box>
		);
	}

	if (formatSelected) {
		return (
			<Box flexDirection="column">
				<Header theme={theme} />
				<Box flexDirection="column" gap={1}>
					{Boolean(isLoading) && (
						<Text color={theme.accent}>Saving configuration...</Text>
					)}
					{error ? (
						<Text color={theme.status.error}>Error: {error.message}</Text>
					) : null}
				</Box>
			</Box>
		);
	}

	return null;
}

/**
 * ConfigWizard component that guides users through configuration creation
 *
 * @example
 * ```tsx
 * <ConfigWizard
 *   theme={theme}
 *   onComplete={(config) => logger.info('Config created', {config})}
 *   onCancel={() => process.exit(0)}
 * />
 * ```
 */
export function ConfigWizard({theme, onComplete, onCancel}: ConfigWizardProps) {
	const {
		state,
		currentInput,
		error,
		setCurrentInput,
		validateAndSetMainUrl,
		validateAndAddSubUrl,
		validateAndAddPage,
		validateAndSetPersona,
		validateAndSetReportPath,
		dispatch,
		setError,
	} = useConfigWizard();
	const [isLoading, setIsLoading] = useState(false);
	const [currentUrlIndex, setCurrentUrlIndex] = useState(0);

	// Get all URLs that need page descriptions
	const getAllUrls = (): string[] => {
		if (
			state.phase === 'pages' ||
			state.phase === 'persona' ||
			state.phase === 'report'
		) {
			return [state.data.mainPageUrl, ...state.data.subPageUrls];
		}

		return [];
	};

	// Render intro phase
	const renderIntro = () => (
		<Box flexDirection="column">
			<Header theme={theme} />
			<Box flexDirection="column" gap={1} marginTop={2}>
				<Text bold color={theme.primary}>
					Welcome to uxlint interactive configuration!
				</Text>
				<Text color={theme.text.secondary}>
					This wizard will help you create a configuration file for your UX
					analysis.
				</Text>
				<Text color={theme.text.secondary}>You will be asked to provide:</Text>
				<Box flexDirection="column" marginLeft={2}>
					<Text color={theme.text.primary}>• Main page URL</Text>
					<Text color={theme.text.primary}>• Additional pages (optional)</Text>
					<Text color={theme.text.primary}>
						• Feature descriptions for each page
					</Text>
					<Text color={theme.text.primary}>• User persona</Text>
					<Text color={theme.text.primary}>• Report output path</Text>
				</Box>
				<Box marginTop={2}>
					<Text color={theme.text.muted}>Press Y to start, N to cancel...</Text>
				</Box>
				<ConfirmInput
					defaultChoice="confirm"
					onCancel={() => {
						onCancel();
					}}
					onConfirm={() => {
						dispatch({type: 'START_WIZARD'});
					}}
				/>
			</Box>
		</Box>
	);

	// Render main URL phase
	const renderMainUrl = () => {
		const handleSubmit = (value: string) => {
			validateAndSetMainUrl(value);
		};

		return (
			<Box flexDirection="column">
				<Header theme={theme} />
				<PromptStep
					stepNumber={1}
					totalSteps={7}
					label="Enter the main page URL to analyze"
					theme={theme}
				>
					<UserInput
						error={error}
						placeholder="https://example.com"
						theme={theme}
						value={currentInput}
						variant={error ? 'error' : 'default'}
						onChange={setCurrentInput}
						onSubmit={handleSubmit}
					/>
				</PromptStep>
			</Box>
		);
	};

	// Render sub URLs phase
	const renderSubUrls = () => {
		if (state.phase !== 'sub-urls') return null;

		return (
			<SubUrlsPhase
				currentInput={currentInput}
				error={error}
				setCurrentInput={setCurrentInput}
				setCurrentUrlIndex={setCurrentUrlIndex}
				state={state}
				theme={theme}
				validateAndAddSubUrl={validateAndAddSubUrl}
			/>
		);
	};

	// Render pages phase
	const renderPages = () => {
		if (state.phase !== 'pages') return null;

		const allUrls = getAllUrls();
		const currentUrl = allUrls[currentUrlIndex];

		// If we've collected all pages, move to next phase
		if (currentUrlIndex >= allUrls.length || !currentUrl) {
			dispatch({type: 'DONE_PAGES'});
			return null;
		}

		const handleSubmit = (value: string) => {
			if (validateAndAddPage(currentUrl, value)) {
				setCurrentUrlIndex(currentUrlIndex + 1);
			}
		};

		return (
			<Box flexDirection="column">
				<Header theme={theme} />
				<PromptStep
					stepNumber={3}
					totalSteps={7}
					label={`Describe the features/purpose of: ${currentUrl}`}
					theme={theme}
				>
					<Box flexDirection="column" gap={1}>
						<Text color={theme.text.muted}>
							Page {currentUrlIndex + 1} of {allUrls.length}
						</Text>
						<UserInput
							error={error}
							placeholder="e.g., Homepage with hero section, product showcase, and testimonials"
							theme={theme}
							value={currentInput}
							variant={error ? 'error' : 'default'}
							onChange={setCurrentInput}
							onSubmit={handleSubmit}
						/>
					</Box>
				</PromptStep>
			</Box>
		);
	};

	// Render persona phase
	const renderPersona = () => {
		if (state.phase !== 'persona') return null;

		return (
			<PersonaPhase
				currentInput={currentInput}
				error={error}
				setCurrentInput={setCurrentInput}
				state={state}
				theme={theme}
				validateAndSetPersona={validateAndSetPersona}
			/>
		);
	};

	// Render report output phase
	const renderReport = () => {
		if (state.phase !== 'report') return null;

		const defaultPath = configIO.getDefaultReportPath();

		const handleSubmit = (value: string) => {
			validateAndSetReportPath(value, defaultPath);
		};

		return (
			<Box flexDirection="column">
				<Header theme={theme} />
				<PromptStep
					stepNumber={5}
					totalSteps={7}
					label="Where should the UX report be saved?"
					theme={theme}
				>
					<Box flexDirection="column" gap={1}>
						<UserInput
							error={error}
							placeholder={defaultPath}
							theme={theme}
							value={currentInput}
							variant={error ? 'error' : 'default'}
							onChange={setCurrentInput}
							onSubmit={handleSubmit}
						/>
						<Text color={theme.text.muted}>
							Press Enter to use default: {defaultPath}
						</Text>
					</Box>
				</PromptStep>
			</Box>
		);
	};

	// Render summary phase
	const renderSummary = () => {
		if (state.phase !== 'summary') return null;

		return (
			<Box flexDirection="column">
				<Header theme={theme} />
				<Box flexDirection="column" gap={2}>
					<ConfigSummary data={state.data} theme={theme} />
					<Box marginTop={1}>
						<Text color={theme.text.muted}>
							Press Y to continue, N to cancel
						</Text>
						<ConfirmInput
							defaultChoice="confirm"
							onCancel={() => {
								onCancel();
							}}
							onConfirm={() => {
								dispatch({type: 'CONFIRM_SUMMARY'});
							}}
						/>
					</Box>
				</Box>
			</Box>
		);
	};

	// Render save phase
	const renderSave = () => {
		if (state.phase !== 'save') return null;

		return (
			<SavePhase
				dispatch={dispatch}
				error={error}
				isLoading={isLoading}
				setError={setError}
				setIsLoading={setIsLoading}
				state={state}
				theme={theme}
				onComplete={onComplete}
			/>
		);
	};

	// Render complete phase
	const renderComplete = () => {
		if (state.phase !== 'complete') return null;

		const savedFile = state.saveOptions?.filePath;

		return (
			<Box flexDirection="column">
				<Header theme={theme} />
				<Box flexDirection="column" gap={1}>
					<Text bold color={theme.status.success}>
						✓ Configuration complete!
					</Text>
					{Boolean(savedFile) && (
						<Text color={theme.text.secondary}>
							Configuration saved to: {savedFile}
						</Text>
					)}
					<Box marginTop={1}>
						<Text color={theme.text.muted}>
							You can now run uxlint to analyze your application.
						</Text>
					</Box>
				</Box>
			</Box>
		);
	};

	// Route to appropriate phase renderer
	switch (state.phase) {
		case 'intro': {
			return renderIntro();
		}

		case 'main-url': {
			return renderMainUrl();
		}

		case 'sub-urls': {
			return renderSubUrls();
		}

		case 'pages': {
			return renderPages();
		}

		case 'persona': {
			return renderPersona();
		}

		case 'report': {
			return renderReport();
		}

		case 'summary': {
			return renderSummary();
		}

		case 'save': {
			return renderSave();
		}

		case 'complete': {
			return renderComplete();
		}
	}
}
