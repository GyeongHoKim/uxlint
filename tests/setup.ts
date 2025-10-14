/**
 * Jest setup file for test environment configuration
 * Disables colors to ensure consistent snapshot outputs across different environments
 */

import process from 'node:process';

// Disable all color output for consistent snapshots
process.env['NO_COLOR'] = '1';
process.env['FORCE_COLOR'] = '0';

// Also disable chalk colors specifically
process.env['CHALK_LEVEL'] = '0';

// Mock process.exit to prevent tests from exiting
process.exit = (() => {
	// No-op
}) as never;
