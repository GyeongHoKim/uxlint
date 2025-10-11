/**
 * ConfigWizard component - Main wizard container
 * Orchestrates the interactive configuration flow through all wizard phases
 */

import React, {useState, useEffect} from 'react';
import {Box, Text} from 'ink';
import {ConfirmInput, Select} from '@inkjs/ui';
import type {ThemeConfig, UxLintConfig} from '../models/index.js';
import type {Page} from '../models/config.js';
import type {WizardAction, WizardState} from '../models/wizard-state.js';
import {useWizard} from '../hooks/use-wizard.js';
import {buildConfig} from '../models/config-builder.js';
import {saveConfigToFile, getDefaultReportPath} from '../models/config-io.js';
import {validationEngine} from '../models/validation-engine.js';
import {Header} from './header.js';
import {UserInput} from './user-input.js';
import {PromptStep} from './prompt-step.js';
import {ConfigSummary} from './config-summary.js';

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
	dispatch,
	currentInput,
	setCurrentInput,
	error,
	setError,
	setCurrentUrlIndex,
}: {
	readonly theme: ThemeConfig;
	readonly state: Extract<WizardState, {phase: 'sub-urls'}>;
	readonly dispatch: React.Dispatch<WizardAction>;
	readonly currentInput: string;
	readonly setCurrentInput: (value: string) => void;
	readonly error: Error | undefined;
	readonly setError: (error: Error | undefined) => void;
	readonly setCurrentUrlIndex: (index: number) => void;
}) {
	const handleValidation = (validator: () => string): string | undefined => {
		try {
			setError(undefined);
			return validator();
		} catch (error_) {
			setError(error_ instanceof Error ? error_ : new Error(String(error_)));
			return undefined;
		}
	};

	const handleAddUrl = (value: string) => {
		// If empty value, user is done adding URLs
		if (!value.trim()) {
			dispatch({type: 'DONE_SUB_URLS'});
			setCurrentUrlIndex(0);
			return;
		}

		const validated = handleValidation(() => validationEngine.url(value));
		if (validated) {
			// Check for duplicates
			const allUrls = [state.data.mainPageUrl, ...state.data.subPageUrls];
			if (allUrls.includes(validated)) {
				setError(new Error('This URL has already been added'));
				return;
			}

			dispatch({type: 'ADD_SUB_URL', payload: validated});
			setCurrentInput('');
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
 * Personas phase component
 */
function PersonasPhase({
	theme,
	state,
	dispatch,
	currentInput,
	setCurrentInput,
	error,
	setError,
}: {
	readonly theme: ThemeConfig;
	readonly state: Extract<WizardState, {phase: 'personas'}>;
	readonly dispatch: React.Dispatch<WizardAction>;
	readonly currentInput: string;
	readonly setCurrentInput: (value: string) => void;
	readonly error: Error | undefined;
	readonly setError: (error: Error | undefined) => void;
}) {
	const handleValidation = (validator: () => string): string | undefined => {
		try {
			setError(undefined);
			return validator();
		} catch (error_) {
			setError(error_ instanceof Error ? error_ : new Error(String(error_)));
			return undefined;
		}
	};

	const handleAddPersona = (value: string) => {
		// If empty value and we have at least one persona, user is done
		if (!value.trim()) {
			if (state.data.personas.length > 0) {
				dispatch({type: 'DONE_PERSONAS'});
			} else {
				setError(new Error('At least one persona is required'));
			}

			return;
		}

		const validated = handleValidation(() => validationEngine.persona(value));
		if (validated) {
			dispatch({type: 'ADD_PERSONA', payload: validated});
			setCurrentInput('');
		}
	};

	const hasMinimumPersonas = state.data.personas.length > 0;

	return (
		<Box flexDirection="column">
			<Header theme={theme} />
			<PromptStep
				stepNumber={4}
				totalSteps={7}
				label="Add user personas (at least one required)"
				theme={theme}
			>
				<Box flexDirection="column" gap={1}>
					{/* Show current personas */}
					{state.data.personas.length > 0 && (
						<Box flexDirection="column" marginBottom={1}>
							<Text color={theme.text.secondary}>
								Added personas ({state.data.personas.length}):
							</Text>
							{state.data.personas.map((persona: string) => (
								<Text key={persona} color={theme.text.primary}>
									{state.data.personas.indexOf(persona) + 1}.{' '}
									{persona.slice(0, 60)}...
								</Text>
							))}
						</Box>
					)}

					<UserInput
						error={error}
						placeholder="e.g., Developer using CLI tools, needs quick setup, keyboard shortcuts"
						theme={theme}
						value={currentInput}
						variant={error ? 'error' : 'default'}
						onChange={setCurrentInput}
						onSubmit={handleAddPersona}
					/>

					<Box marginTop={1}>
						<Text color={theme.text.muted}>
							Describe user goals, constraints, devices, accessibility needs
							(min 20 chars)
						</Text>
					</Box>

					{Boolean(hasMinimumPersonas) && (
						<Box marginTop={1}>
							<Text color={theme.text.muted}>
								Press Enter with empty input when done
							</Text>
						</Box>
					)}
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
	readonly dispatch: React.Dispatch<WizardAction>;
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
					const filePath = await saveConfigToFile(config, {
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
 *   onComplete={(config) => console.log('Config created:', config)}
 *   onCancel={() => process.exit(0)}
 * />
 * ```
 */
export function ConfigWizard({theme, onComplete, onCancel}: ConfigWizardProps) {
	const {state, dispatch} = useWizard();
	const [currentInput, setCurrentInput] = useState('');
	const [error, setError] = useState<Error | undefined>();
	const [isLoading, setIsLoading] = useState(false);
	const [currentUrlIndex, setCurrentUrlIndex] = useState(0);

	// Get all URLs that need page descriptions
	const getAllUrls = (): string[] => {
		if (
			state.phase === 'pages' ||
			state.phase === 'personas' ||
			state.phase === 'report'
		) {
			return [state.data.mainPageUrl, ...state.data.subPageUrls];
		}

		return [];
	};

	// Handle validation errors
	const handleValidation = (validator: () => string): string | undefined => {
		try {
			setError(undefined);
			return validator();
		} catch (error_) {
			setError(error_ instanceof Error ? error_ : new Error(String(error_)));
			return undefined;
		}
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
					<Text color={theme.text.primary}>• User personas</Text>
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
			const validated = handleValidation(() => validationEngine.url(value));
			if (validated) {
				dispatch({type: 'SET_MAIN_URL', payload: validated});
				setCurrentInput('');
			}
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
				dispatch={dispatch}
				error={error}
				setCurrentInput={setCurrentInput}
				setCurrentUrlIndex={setCurrentUrlIndex}
				setError={setError}
				state={state}
				theme={theme}
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
			const validated = handleValidation(() =>
				validationEngine.featureDescription(value),
			);
			if (validated) {
				const page: Page = {
					url: currentUrl,
					features: validated,
				};
				dispatch({type: 'ADD_PAGE', payload: page});
				setCurrentInput('');
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

	// Render personas phase
	const renderPersonas = () => {
		if (state.phase !== 'personas') return null;

		return (
			<PersonasPhase
				currentInput={currentInput}
				dispatch={dispatch}
				error={error}
				setCurrentInput={setCurrentInput}
				setError={setError}
				state={state}
				theme={theme}
			/>
		);
	};

	// Render report output phase
	const renderReport = () => {
		if (state.phase !== 'report') return null;

		const defaultPath = getDefaultReportPath();

		const handleSubmit = (value: string) => {
			const pathToValidate = value.trim() || defaultPath;
			const validated = handleValidation(() =>
				validationEngine.reportPath(pathToValidate),
			);
			if (validated) {
				dispatch({type: 'SET_REPORT_OUTPUT', payload: validated});
				dispatch({type: 'PROCEED_TO_SUMMARY'});
				setCurrentInput('');
			}
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

		case 'personas': {
			return renderPersonas();
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
