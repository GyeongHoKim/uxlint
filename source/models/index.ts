/**
 * Models module exports
 * Central export point for all model classes, types, and utilities
 */

// Error classes
export * from './errors.js';

// Theme system
export * from './theme.js';

// Configuration models
export * from './config.js';

// Analysis models
export * from './analysis.js';

// Wizard state types
export * from './wizard-state.js';

// Config builder (data transformation)
export * from './config-builder.js';

// State machine
export * from './uxlint-machine.js';

// Authentication models
export type {AuthenticationSession, SessionMetadata} from './auth-session.js';
export {isValidSession, isSessionExpired} from './auth-session.js';
export type {UserProfile} from './user-profile.js';
export type {TokenSet} from './token-set.js';
export type {PKCEParameters} from './pkce-params.js';
export {AuthErrorCode, AuthenticationError} from './auth-error.js';

// Commonly used types for convenience
export type {Page, Persona, ReportConfig, UxLintConfig} from './config.js';
export type {
	AnalysisStage,
	AnalysisState,
	FindingSeverity,
	PageAnalysis,
	UxFinding,
	UxReport,
} from './analysis.js';
