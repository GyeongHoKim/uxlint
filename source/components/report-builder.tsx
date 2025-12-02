/**
 * ReportBuilder Component
 * Handles report generation after analysis completes
 *
 * @packageDocumentation
 */

import {Box, Text} from 'ink';
import {useEffect, useState} from 'react';
import type {ThemeConfig} from '../models/theme.js';

/**
 * ReportBuilder component props
 */
export type ReportBuilderProps = {
	/** Theme for styling */
	readonly theme: ThemeConfig;

	/** Callback when report generation completes */
	readonly onComplete: () => void;

	/** Callback when report generation fails */
	readonly onError: (error: Error) => void;
};

/**
 * ReportBuilder component
 * Generates the final report after analysis
 */
export function ReportBuilder({
	theme,
	onComplete,
	onError,
}: ReportBuilderProps) {
	const [status, setStatus] = useState<'generating' | 'complete' | 'error'>(
		'generating',
	);

	useEffect(() => {
		// Simulate report generation
		// In a real implementation, this would generate the actual report
		const timer = setTimeout(() => {
			try {
				setStatus('complete');
				onComplete();
			} catch (error) {
				setStatus('error');
				onError(
					error instanceof Error
						? error
						: new Error('Report generation failed'),
				);
			}
		}, 100);

		return () => {
			clearTimeout(timer);
		};
	}, [onComplete, onError]);

	return (
		<Box flexDirection="column" gap={1}>
			<Text color="green">✓ Analysis complete!</Text>
			{status === 'generating' && (
				<Text color={theme.secondary}>Generating report...</Text>
			)}
			{status === 'complete' && (
				<Text color="green">✓ Report generated successfully</Text>
			)}
			{status === 'error' && (
				<Text color="red">✗ Failed to generate report</Text>
			)}
		</Box>
	);
}
