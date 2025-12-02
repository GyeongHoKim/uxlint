/**
 * Contract: UxLint State Machine
 * 
 * This file defines the type contracts for the XState machine.
 * It serves as a reference for implementation and testing.
 */

import type { UxLintConfig } from '../../../source/models/config.js';

// ============================================================================
// Machine Input
// ============================================================================

/**
 * Input provided when creating the machine actor
 */
export interface UxlintMachineInput {
  /** Whether --interactive flag was provided */
  interactive: boolean;
  /** Whether uxlintrc file exists in CWD */
  configExists: boolean;
  /** Pre-loaded configuration if exists */
  config?: UxLintConfig;
}

// ============================================================================
// Machine Context
// ============================================================================

/**
 * Runtime context maintained by the state machine
 */
export interface UxlintMachineContext {
  /** Whether --interactive flag was provided */
  interactive: boolean;
  /** Whether uxlintrc file exists in CWD */
  configExists: boolean;
  /** Loaded configuration (from file or wizard) */
  config: UxLintConfig | undefined;
  /** Configuration created by wizard */
  wizardConfig: UxLintConfig | undefined;
  /** Analysis result from AI */
  analysisResult: UxReport | undefined;
  /** Error that occurred during execution */
  error: Error | undefined;
  /** Process exit code (0 = success, 1 = error) */
  exitCode: number;
}

// ============================================================================
// Machine Events
// ============================================================================

export type UxlintMachineEvent =
  | InitializeEvent
  | WizardCompleteEvent
  | WizardCancelEvent
  | AnalysisCompleteEvent
  | AnalysisErrorEvent
  | ReportCompleteEvent
  | ReportErrorEvent;

export interface InitializeEvent {
  type: 'INITIALIZE';
  interactive: boolean;
  configExists: boolean;
  config?: UxLintConfig;
}

export interface WizardCompleteEvent {
  type: 'WIZARD_COMPLETE';
  config: UxLintConfig;
}

export interface WizardCancelEvent {
  type: 'WIZARD_CANCEL';
}

export interface AnalysisCompleteEvent {
  type: 'ANALYSIS_COMPLETE';
  result: UxReport;
}

export interface AnalysisErrorEvent {
  type: 'ANALYSIS_ERROR';
  error: Error;
}

export interface ReportCompleteEvent {
  type: 'REPORT_COMPLETE';
}

export interface ReportErrorEvent {
  type: 'REPORT_ERROR';
  error: Error;
}

// ============================================================================
// State Value Types
// ============================================================================

/**
 * All possible state values in the machine
 */
export type UxlintStateValue =
  | 'idle'
  | { tty: 'wizard' }
  | { tty: 'analyzeWithUI' }
  | { ci: 'analyzeWithoutUI' }
  | { ci: 'error' }
  | 'reportBuilder'
  | 'done';

// ============================================================================
// Analysis Result (placeholder - should match existing UxReport)
// ============================================================================

export interface UxReport {
  pages: PageAnalysis[];
  summary: string;
  recommendations: string[];
}

export interface PageAnalysis {
  url: string;
  findings: string[];
  score: number;
}

// ============================================================================
// Error Types
// ============================================================================

export class MissingConfigError extends Error {
  constructor() {
    super(
      'Configuration file not found. Use --interactive flag to create one, ' +
      'or create .uxlintrc.yml or .uxlintrc.json in the current directory.'
    );
    this.name = 'MissingConfigError';
  }
}

