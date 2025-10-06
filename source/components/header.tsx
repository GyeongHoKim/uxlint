import {Box, Text, useStdout} from 'ink';
import BigText from 'ink-big-text';
import type {ThemeConfig} from '../models/theme.js';

export type HeaderProps = {
	readonly theme: ThemeConfig;
};

/**
 * Header component with branding and responsive layout
 */
export function Header({theme}: HeaderProps) {
	const {stdout} = useStdout();

	// Get terminal width from stdout, fallback to 80 if not available
	const terminalWidth = stdout?.columns ?? 80;

	// Determine if we should use compact layout
	const isCompact = terminalWidth < 60;

	return (
		<Box flexDirection="column" alignItems="center" marginBottom={1}>
			{/* Big Text Logo or Compact Title */}
			<Box marginBottom={1}>
				{isCompact ? (
					<BigText text="ux" colors={[theme.accent]} />
				) : (
					<BigText text="uxlint" colors={[theme.accent]} />
				)}
			</Box>

			{/* Subtitle/Tagline */}
			<Box marginBottom={1}>
				<Text color={theme.text.secondary}>
					{isCompact
						? 'AI-powered UX review CLI'
						: 'AI-powered UX review CLI tool for web applications'}
				</Text>
			</Box>

			{/* Additional branding line */}
			<Box>
				<Text color={theme.text.muted}>
					{isCompact
						? 'Persona-aware analysis'
						: 'Get actionable UX feedback with persona-aware analysis'}
				</Text>
			</Box>
		</Box>
	);
}
