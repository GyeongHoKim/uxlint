/**
 * ConfigSummary component - Display collected configuration before saving
 * Shows a formatted summary of all wizard data for user review
 */

import {Box, Text} from 'ink';
import type {ThemeConfig} from '../models/index.js';
import type {ConfigurationData} from '../models/wizard-state.js';

/**
 * Props for the ConfigSummary component
 */
export type ConfigSummaryProps = {
	readonly data: ConfigurationData;
	readonly theme: ThemeConfig;
};

/**
 * ConfigSummary component that displays complete configuration data
 *
 * @example
 * ```tsx
 * <ConfigSummary data={wizardData} theme={theme} />
 * ```
 */
export function ConfigSummary({data, theme}: ConfigSummaryProps) {
	return (
		<Box flexDirection="column" gap={1}>
			{/* Title */}
			<Box marginBottom={1}>
				<Text bold color={theme.primary}>
					Configuration Summary
				</Text>
			</Box>

			{/* Main Page URL */}
			<Box flexDirection="column">
				<Text color={theme.text.secondary}>Main Page:</Text>
				<Text color={theme.text.primary}> {data.mainPageUrl}</Text>
			</Box>

			{/* Sub Page URLs */}
			{data.subPageUrls.length > 0 && (
				<Box flexDirection="column">
					<Text color={theme.text.secondary}>
						Additional Pages ({data.subPageUrls.length}):
					</Text>
					{data.subPageUrls.map(url => (
						<Text key={url} color={theme.text.primary}>
							• {url}
						</Text>
					))}
				</Box>
			)}

			{/* Page Features */}
			<Box flexDirection="column">
				<Text color={theme.text.secondary}>
					Page Descriptions ({data.pages.length}):
				</Text>
				{data.pages.map(page => (
					<Box key={page.url} flexDirection="column" marginLeft={2}>
						<Text color={theme.accent}>{page.url}</Text>
						<Text color={theme.text.primary}>
							{page.features.slice(0, 100)}
							{page.features.length > 100 ? '...' : ''}
						</Text>
					</Box>
				))}
			</Box>

			{/* Persona */}
			<Box flexDirection="column">
				<Text color={theme.text.secondary}>Persona:</Text>
				<Box flexDirection="column" marginLeft={2}>
					<Text color={theme.text.primary}>
						{data.persona.slice(0, 80)}
						{data.persona.length > 80 ? '...' : ''}
					</Text>
				</Box>
			</Box>

			{/* Report Output */}
			<Box flexDirection="column">
				<Text color={theme.text.secondary}>Report Output:</Text>
				<Text color={theme.text.primary}> {data.reportOutput}</Text>
			</Box>
		</Box>
	);
}
