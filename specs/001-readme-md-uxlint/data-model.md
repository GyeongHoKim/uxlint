# Data Model: CLI State Machine Refactor

**Date**: 2025-12-02  
**Feature Branch**: `001-readme-md-uxlint`

## State Machine Definition

### States

```
IDLE
├── TTY (--interactive flag present)
│   ├── WIZARD (config not found)
│   │   └── transitions to ANALYZE_WITH_UI on WIZARD_COMPLETE
│   └── ANALYZE_WITH_UI (config found)
│       └── transitions to REPORT_BUILDER on ANALYSIS_COMPLETE
└── CI (--interactive flag absent)
    ├── ANALYZE_WITHOUT_UI (config found)
    │   └── transitions to REPORT_BUILDER on ANALYSIS_COMPLETE
    └── ERROR (config not found)
        └── terminal state

REPORT_BUILDER
└── transitions to DONE on REPORT_COMPLETE

DONE
└── terminal state
```

### State Enum

```typescript
type UxlintState =
  | 'idle'
  | 'tty'
  | 'tty.wizard'
  | 'tty.analyzeWithUI'
  | 'ci'
  | 'ci.analyzeWithoutUI'
  | 'ci.error'
  | 'reportBuilder'
  | 'done';
```

---

## Context (Machine Data)

### UxlintMachineContext

| Field | Type | Description |
|-------|------|-------------|
| `interactive` | `boolean` | Whether --interactive flag was provided |
| `configExists` | `boolean` | Whether uxlintrc file exists in CWD |
| `config` | `UxLintConfig \| undefined` | Loaded configuration (if exists) |
| `wizardConfig` | `UxLintConfig \| undefined` | Configuration created by wizard |
| `analysisResult` | `UxReport \| undefined` | Analysis result from AI |
| `error` | `Error \| undefined` | Error that occurred during execution |
| `exitCode` | `number` | Process exit code (0 = success, 1 = error) |

### TypeScript Definition

```typescript
interface UxlintMachineContext {
  interactive: boolean;
  configExists: boolean;
  config: UxLintConfig | undefined;
  wizardConfig: UxLintConfig | undefined;
  analysisResult: UxReport | undefined;
  error: Error | undefined;
  exitCode: number;
}
```

---

## Events

### UxlintMachineEvent

| Event | Payload | Description |
|-------|---------|-------------|
| `INITIALIZE` | `{ interactive: boolean; configExists: boolean; config?: UxLintConfig }` | Initial event after CLI parsing |
| `WIZARD_COMPLETE` | `{ config: UxLintConfig }` | Wizard finished creating config |
| `WIZARD_CANCEL` | - | User cancelled wizard |
| `ANALYSIS_COMPLETE` | `{ result: UxReport }` | Analysis finished successfully |
| `ANALYSIS_ERROR` | `{ error: Error }` | Analysis failed |
| `REPORT_COMPLETE` | - | Report written to disk |
| `REPORT_ERROR` | `{ error: Error }` | Report writing failed |

### TypeScript Definition

```typescript
type UxlintMachineEvent =
  | { type: 'INITIALIZE'; interactive: boolean; configExists: boolean; config?: UxLintConfig }
  | { type: 'WIZARD_COMPLETE'; config: UxLintConfig }
  | { type: 'WIZARD_CANCEL' }
  | { type: 'ANALYSIS_COMPLETE'; result: UxReport }
  | { type: 'ANALYSIS_ERROR'; error: Error }
  | { type: 'REPORT_COMPLETE' }
  | { type: 'REPORT_ERROR'; error: Error };
```

---

## Input (Initialization)

### UxlintMachineInput

| Field | Type | Description |
|-------|------|-------------|
| `interactive` | `boolean` | CLI --interactive flag value |
| `configExists` | `boolean` | Result of findConfigFile() |
| `config` | `UxLintConfig \| undefined` | Pre-loaded config if exists |

### TypeScript Definition

```typescript
interface UxlintMachineInput {
  interactive: boolean;
  configExists: boolean;
  config?: UxLintConfig;
}
```

---

## State Transitions

### Transition Table

| From State | Event | Guard | To State | Actions |
|------------|-------|-------|----------|---------|
| `idle` | (automatic) | `interactive === true` | `tty` | - |
| `idle` | (automatic) | `interactive === false` | `ci` | - |
| `tty` | (automatic) | `configExists === false` | `tty.wizard` | - |
| `tty` | (automatic) | `configExists === true` | `tty.analyzeWithUI` | `assignConfig` |
| `tty.wizard` | `WIZARD_COMPLETE` | - | `tty.analyzeWithUI` | `assignWizardConfig` |
| `tty.wizard` | `WIZARD_CANCEL` | - | `done` | `setExitCodeZero` |
| `tty.analyzeWithUI` | `ANALYSIS_COMPLETE` | - | `reportBuilder` | `assignAnalysisResult` |
| `tty.analyzeWithUI` | `ANALYSIS_ERROR` | - | `done` | `assignError`, `setExitCodeOne` |
| `ci` | (automatic) | `configExists === true` | `ci.analyzeWithoutUI` | `assignConfig` |
| `ci` | (automatic) | `configExists === false` | `ci.error` | `createMissingConfigError` |
| `ci.analyzeWithoutUI` | `ANALYSIS_COMPLETE` | - | `reportBuilder` | `assignAnalysisResult` |
| `ci.analyzeWithoutUI` | `ANALYSIS_ERROR` | - | `done` | `assignError`, `setExitCodeOne` |
| `ci.error` | (automatic) | - | `done` | `setExitCodeOne` |
| `reportBuilder` | `REPORT_COMPLETE` | - | `done` | `setExitCodeZero` |
| `reportBuilder` | `REPORT_ERROR` | - | `done` | `assignError`, `setExitCodeOne` |

---

## Actions

### Action Definitions

| Action | Description | Context Update |
|--------|-------------|----------------|
| `assignConfig` | Store loaded config in context | `config = event.config \|\| input.config` |
| `assignWizardConfig` | Store wizard-created config | `wizardConfig = event.config`, `config = event.config` |
| `assignAnalysisResult` | Store analysis result | `analysisResult = event.result` |
| `assignError` | Store error | `error = event.error` |
| `setExitCodeZero` | Set success exit code | `exitCode = 0` |
| `setExitCodeOne` | Set error exit code | `exitCode = 1` |
| `createMissingConfigError` | Create config missing error | `error = new MissingConfigError()` |

---

## Guards

### Guard Definitions

| Guard | Description | Condition |
|-------|-------------|-----------|
| `isInteractive` | Check if interactive mode | `context.interactive === true` |
| `isCI` | Check if CI mode | `context.interactive === false` |
| `hasConfig` | Check if config exists | `context.configExists === true` |
| `noConfig` | Check if config missing | `context.configExists === false` |

---

## Related Entities

### UxLintConfig (existing)

```typescript
interface UxLintConfig {
  mainPageUrl: string;
  subPageUrls: string[];
  pages: Array<{ url: string; features: string }>;
  persona: string;
  report: { output: string };
}
```

### UxReport (existing)

```typescript
interface UxReport {
  // Analysis result structure
  pages: PageAnalysis[];
  summary: string;
  recommendations: string[];
}
```

### MissingConfigError (new)

```typescript
class MissingConfigError extends Error {
  constructor() {
    super(
      'Configuration file not found. Use --interactive flag to create one, ' +
      'or create .uxlintrc.yml or .uxlintrc.json in the current directory.'
    );
    this.name = 'MissingConfigError';
  }
}
```

