/**
 * AVA setup file for test environment configuration.
 * This file runs before all tests and configures:
 * - Color output settings for consistent test outputs
 * - MSW (Mock Service Worker) for network request mocking
 */

import process from 'node:process';
import {server} from './mocks/server.js';

// Disable all color output for consistent test outputs
process.env['NO_COLOR'] = '1';
process.env['FORCE_COLOR'] = '0';

// Also disable chalk colors specifically
process.env['CHALK_LEVEL'] = '0';

/**
 * Start MSW server globally for all tests.
 * Individual tests can override handlers using server.use()
 */
server.listen({onUnhandledRequest: 'bypass'});

/**
 * Clean up MSW server when the process exits.
 */
process.on('exit', () => {
	server.close();
});
