/**
 * AVA setup file for test environment configuration
 * Disables colors to ensure consistent test outputs across different environments
 */

import process from 'node:process';

// Disable all color output for consistent test outputs
process.env['NO_COLOR'] = '1';
process.env['FORCE_COLOR'] = '0';

// Also disable chalk colors specifically
process.env['CHALK_LEVEL'] = '0';

// Note: process.exit mock removed (AVA handles test isolation differently)
