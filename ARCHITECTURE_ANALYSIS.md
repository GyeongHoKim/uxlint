# UXLINT CODEBASE ARCHITECTURE ANALYSIS

## Executive Summary

**uxlint** is an AI-powered UX review CLI tool (6,030 lines of TypeScript) with a well-structured, layered architecture. The codebase demonstrates clear separation of concerns with distinct layers for:
- **Domain Models** (14 files): Pure business logic and data structures
- **Services** (2 files): External integrations (AI, MCP browser automation)
- **React Hooks** (5 files): Application state management
- **UI Components** (7 files): Terminal UI via Ink framework
- **MCP Client Library** (6 files): Model Context Protocol implementation

The architecture follows a **unidirectional data flow** with well-defined module boundaries and no apparent circular dependencies.

---

## 1. DIRECTORY STRUCTURE WITH FILE COUNTS

```
source/                                    (39 TypeScript files total)
├── Entry Points
│   ├── cli.tsx                           (1 file) - CLI entry point
│   └── app.tsx                           (1 file) - React/Ink app root
│
├── models/                               (14 files) - Domain models & business logic
│   ├── Core Types
│   │   ├── analysis.ts                   - UX analysis domain model
│   │   ├── config.ts                     - Configuration domain model
│   │   └── wizard-state.ts               - Wizard state types
│   │
│   ├── I/O & Transformation
│   │   ├── config-io.ts                  - Config file read/write/parse/validate
│   │   ├── config-builder.ts             - Config data transformation
│   │   └── input-processor.ts            - Input validation & normalization
│   │
│   ├── Utilities & Services
│   │   ├── env-config.ts                 - Environment variable loading
│   │   ├── report-generator.ts           - Markdown report generation
│   │   ├── validation-engine.ts          - Reusable validators
│   │   ├── theme.ts                      - Theme configuration
│   │   ├── session-manager.ts            - Session management
│   │   ├── mcp-tool-adapter.ts           - MCP tools → AI SDK conversion
│   │   ├── errors.ts                     - Custom error classes
│   │   └── index.ts                      - Barrel export
│   
├── services/                             (2 files) - External service adapters
│   ├── ai-service.ts                     - Claude AI via Vercel AI SDK
│   └── mcp-page-capture.ts               - Browser automation via Playwright MCP
│
├── hooks/                                (5 files) - React state management
│   ├── use-analysis.ts                   - Multi-page analysis orchestration
│   ├── use-config.ts                     - Config loading & state
│   ├── use-mcp-client.ts                 - MCP client lifecycle
│   ├── use-browser-automation.ts         - Browser automation via MCP
│   ├── use-wizard.ts                     - Config wizard state machine
│   └── index.ts                          - Barrel export
│
├── components/                           (7 files) - Terminal UI (Ink)
│   ├── Workflow
│   │   ├── analysis-runner.tsx           - Analysis orchestration UI
│   │   ├── analysis-progress.tsx         - Progress display
│   │   └── config-wizard.tsx             - Interactive config creation
│   │
│   ├── Reusable
│   │   ├── config-summary.tsx            - Config display
│   │   ├── header.tsx                    - App header
│   │   ├── prompt-step.tsx               - Wizard step UI
│   │   ├── user-input.tsx                - Input field
│   │   ├── user-input-label.tsx          - Input label
│   │   └── index.ts                      - Barrel export
│
└── mcp/                                  (6 files) - MCP client library
    └── client/
        ├── mcp-client.ts                 - Main MCP client (stdio transport)
        ├── playwright-client.ts          - Playwright MCP wrapper
        ├── types.ts                      - MCP type definitions
        ├── config.ts                     - MCP configuration from env
        ├── errors.ts                     - MCP error classes
        └── validators.ts                 - Input validation for MCP
```

---

## 2. KEY ABSTRACTIONS & INTERFACES

### 2.1 Domain Models (models/)

#### Analysis Domain
```typescript
// Core types in analysis.ts
type AnalysisStage = 'idle' | 'navigating' | 'analyzing' | 'generating-report' | 'complete' | 'error'
type AnalysisState = {  // React hook state
  currentPageIndex: number
  totalPages: number
  currentStage: AnalysisStage
  analyses: PageAnalysis[]
  report?: UxReport
  error?: Error
}

type PageAnalysis = {
  pageUrl: string
  features: string
  snapshot: string
  findings: UxFinding[]
  analysisTimestamp: number
  status: AnalysisStatus
  error?: string
}

type UxFinding = {  // Single UX issue
  severity: 'critical' | 'high' | 'medium' | 'low'
  category: string
  description: string
  personaRelevance: string[]
  recommendation: string
  pageUrl: string
}

type UxReport = {  // Final report
  metadata: ReportMetadata
  pages: PageAnalysis[]
  summary: string
  prioritizedFindings: UxFinding[]
}
```

#### Configuration Domain
```typescript
// Core types in config.ts
type Page = {
  url: string
  features: string
}

type Persona = string  // Free-form persona description

type UxLintConfig = {
  mainPageUrl: string
  subPageUrls: string[]
  pages: Page[]
  personas: Persona[]
  report: { output: string }
}

// Type guards for runtime validation
function isUxLintConfig(value: unknown): value is UxLintConfig { ... }
function isPage(value: unknown): value is Page { ... }
```

### 2.2 MCP Client Library (mcp/client/)

```typescript
// Core types in types.ts
type Tool = {
  name: string
  description?: string
  inputSchema: Record<string, unknown>
  outputSchema?: Record<string, unknown>
}

type NavigateResult = { success: boolean; url: string; title?: string; status?: number }
type ScreenshotResult = { screenshot: string; width: number; height: number; format?: 'png' | 'jpeg' }
type SnapshotResult = { snapshot: string; timestamp?: number }

// Main client class in mcp-client.ts
class McpClient {
  constructor(name: string, version: string)
  async connect(serverCommand: string, serverArgs: string[]): Promise<void>
  async listTools(): Promise<Tool[]>
  async callTool<T>(name: string, args: Record<string, unknown>, timeout?: number): Promise<T>
  async close(): Promise<void>
  isConnected(): boolean
}

// Playwright wrapper in playwright-client.ts
class PlaywrightClient {
  constructor(mcpClient: McpClient)
  async navigate(url: string, timeout?: number): Promise<NavigateResult>
  async takeScreenshot(): Promise<ScreenshotResult>
  async getSnapshot(timeout?: number): Promise<SnapshotResult>
  async close(): Promise<void>
}
```

### 2.3 Service Layer (services/)

```typescript
// ai-service.ts - Claude AI service
function buildSystemPrompt(personas: string[], hasTools: boolean): string
function buildAnalysisPrompt(prompt: AnalysisPrompt, hasTools: boolean): string
function parseAnalysisResponse(response: string, pageUrl: string): AnalysisResult
async function analyzePageWithAi(
  prompt: AnalysisPrompt,
  onChunk?: (chunk: string) => void,
  mcpClient?: McpClient,
): Promise<AnalysisResult>

// mcp-page-capture.ts - Browser automation wrapper
class McpPageCapture {
  async capturePage(url: string, timeout?: number): Promise<PageCaptureResult>
  async getMcpClient(): Promise<McpClient>
  async close(): Promise<void>
}
```

---

## 3. MODULE DEPENDENCY GRAPH

### 3.1 Import Relationships (Top-Level View)

```
┌─────────────────────────────────────────────────────────────────┐
│                          CLI & App Layer                         │
├─────────────────────────────────────────────────────────────────┤
│  cli.tsx → app.tsx                                               │
│       ↓                                                           │
│  Components + Hooks + Models                                     │
└──────────────────────────┬──────────────────────────────────────┘
                           │
        ┌──────────────────┼──────────────────┐
        │                  │                  │
        ↓                  ↓                  ↓
   Components         Hooks (React)      Models (Domain)
        │                  │                  │
        └──────────────────┼──────────────────┘
                           │
        ┌──────────────────┼──────────────────┐
        │                  │                  │
        ↓                  ↓                  ↓
    Services          MCP Client        Config I/O
```

### 3.2 Detailed Import Chain for Analysis Workflow

```
cli.tsx
  ↓ imports
app.tsx
  ├─ imports hooks/use-config.ts
  │    └─ imports models/config-io.ts
  │         ├─ imports models/config.ts
  │         └─ imports models/errors.ts
  │
  └─ imports components/AnalysisRunner.tsx
       ├─ imports hooks/use-analysis.ts
       │    ├─ imports models/config.ts
       │    ├─ imports models/analysis.ts (types)
       │    ├─ imports services/mcp-page-capture.ts
       │    │    ├─ imports mcp/client/mcp-client.ts
       │    │    ├─ imports mcp/client/playwright-client.ts
       │    │    ├─ imports mcp/client/config.ts
       │    │    └─ imports mcp/client/errors.ts
       │    ├─ imports services/ai-service.ts
       │    │    ├─ imports mcp/client/mcp-client.ts (types)
       │    │    ├─ imports models/analysis.ts (UxFinding)
       │    │    ├─ imports models/env-config.ts
       │    │    └─ imports models/mcp-tool-adapter.ts
       │    │         ├─ imports mcp/client/mcp-client.ts (types)
       │    │         └─ imports mcp/client/types.ts
       │    └─ imports models/report-generator.ts
       │         └─ imports models/analysis.ts
       │
       └─ imports components/AnalysisProgress.tsx
            └─ imports models/theme.ts
```

### 3.3 Dependency Matrix (Who Imports What)

| Importing Module | imports models | imports services | imports mcp | imports hooks | imports components |
|------------------|---|---|---|---|---|
| cli.tsx | ✓ | - | - | - | - |
| app.tsx | ✓ | - | - | ✓ | ✓ |
| hooks/ | ✓ | ✓ | ✓ | - | - |
| components/ | ✓ | - | - | ✓ | - |
| services/ | ✓ | - | ✓ | - | - |
| models/ | ✓ | - | - | - | - |
| mcp/client/ | ✓ | - | - | - | - |

---

## 4. DATA FLOW ANALYSIS

### 4.1 Complete User Analysis Workflow

```
User Interaction (Terminal UI)
        ↓
    cli.tsx:
    - Determine mode (analysis/interactive/normal)
    - Load environment config if needed
        ↓
    app.tsx:
    - Route to AnalysisRunner component if mode === 'analysis'
        ↓
    AnalysisRunner Component:
    - useEffect calls runAnalysis()
    - Uses useAnalysis hook for orchestration
        ↓
    useAnalysis Hook:
    - Initialize McpPageCapture (lazy)
    - For each page in config:
        1. Get underlying MCP client → getMcpClient()
        2. Call analyzePageWithAi():
           - Connect to MCP server
           - Fetch available tools from server
           - Convert MCP tools to Claude-compatible format
           - Stream Claude response with tool calling
           - Parse response → UxFinding[] 
        3. Store PageAnalysis result
    - Generate final report
        ↓
    Report Generation:
    - generateReport() aggregates all PageAnalysis
    - Sorts findings by severity
    - Writes markdown to disk via writeReportToFile()
        ↓
    Exit with status code
```

### 4.2 Data Structures Through the Pipeline

```
Configuration
    ↓ (via useConfig)
UxLintConfig {
  pages: Page[],
  personas: Persona[],
  report: { output: string }
}
    ↓ (for each page via useAnalysis)
AnalysisPrompt {
  snapshot: string,
  pageUrl: string,
  features: string,
  personas: string[]
}
    ↓ (to analyzePageWithAi)
Claude API Call {
  system: buildSystemPrompt(personas, hasTools),
  prompt: buildAnalysisPrompt(prompt, hasTools),
  tools: convertMcpToolsToClaudeTools(mcpTools, mcpClient)
}
    ↓ (Claude returns with tool calls)
Tool Invocation via MCP:
  - browser_navigate(url)
  - browser_take_screenshot()
  - browser_snapshot()
    ↓ (via mcpClient.callTool)
Tool Results (MCP Response)
    ↓ (returned to Claude for reasoning)
Claude Final Response (markdown)
    ↓ (parseAnalysisResponse)
AnalysisResult {
  findings: UxFinding[],
  summary: string
}
    ↓ (accumulated into PageAnalysis)
PageAnalysis {
  pageUrl: string,
  findings: UxFinding[],
  status: 'complete' | 'failed'
}
    ↓ (all pages aggregated)
UxReport {
  metadata: ReportMetadata,
  pages: PageAnalysis[],
  prioritizedFindings: UxFinding[]
}
    ↓ (generateMarkdownReport)
Markdown String
    ↓ (writeReportToFile)
File: ux-report.md
```

---

## 5. LAYER SEPARATION & BOUNDARIES

### 5.1 Layered Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│ Presentation Layer (Components + CLI)                            │
│ - cli.tsx, app.tsx                                               │
│ - React/Ink components for terminal UI                           │
│ - NO direct business logic, NO direct service calls              │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│ Application Layer (Hooks - React State Management)               │
│ - useAnalysis, useConfig, useMcpClient, useWizard                │
│ - Orchestrates workflow and state transitions                    │
│ - Coordinates between UI and domain/service layers               │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│ Domain & Service Layer                                           │
│ - models/: Pure business logic, types, I/O, validation           │
│ - services/: External integrations (AI, MCP)                     │
│ - Implements core analysis algorithm and report generation       │
│ - Contains all business rules                                    │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│ Infrastructure Layer                                             │
│ - mcp/client/: MCP client library                                │
│ - Direct interaction with external systems (MCP server)          │
│ - Low-level protocol handling                                    │
└─────────────────────────────────────────────────────────────────┘
```

### 5.2 Boundary Enforcement

**Strong Boundaries:**
- ✓ Components DO NOT directly import services or mcp/client
- ✓ Components only import hooks and models/types
- ✓ Hooks coordinate between components, services, and models
- ✓ Services only import models, mcp/client, and external SDKs
- ✓ Models are independent, no cross-layer imports

**Potential Weak Points:**
- useAnalysis directly instantiates McpPageCapture (tight coupling to service)
  - But this is intentional: hook is responsible for managing service lifecycle
- Models layer has no abstraction for external SDKs (ai-sdk, @modelcontextprotocol)
  - These are wrapped in services/mcp layers appropriately

---

## 6. CIRCULAR DEPENDENCY ANALYSIS

**Result: NO CIRCULAR DEPENDENCIES DETECTED**

Dependency direction is strictly unidirectional:
```
CLI → Components
Components → Hooks
Hooks → Services + Models
Services → Models + MCP Client
MCP Client → Models/Types
Models → [no dependencies to other layers]
```

All dependencies are bottom-up (toward the domain/infrastructure layers).

---

## 7. KEY ABSTRACTIONS & DESIGN PATTERNS

### 7.1 Abstraction Levels

| Layer | Abstraction | Purpose |
|-------|-------------|---------|
| **MCP Client** | McpClient class | Hide MCP SDK complexity behind simple API (connect, listTools, callTool) |
| **Playwright** | PlaywrightClient class | Wrap Playwright MCP operations (navigate, screenshot, snapshot) |
| **Page Capture** | McpPageCapture class | Combine Playwright ops into higher-level "capture page" abstraction |
| **AI Service** | analyzePageWithAi function | Abstract Claude API + tool calling + response parsing |
| **Config I/O** | config-io functions | Separate file I/O, parsing, and validation concerns |
| **Analysis** | useAnalysis hook | Orchestrate multi-page analysis workflow |

### 7.2 Design Patterns Used

| Pattern | Location | Purpose |
|---------|----------|---------|
| **Adapter** | mcp-tool-adapter.ts | Convert MCP tool schema to Vercel AI SDK Tool format |
| **Facade** | McpPageCapture | Simplify MCP client usage for page analysis |
| **Wrapper/Decorator** | PlaywrightClient | Add abstraction over MCP Playwright tools |
| **Hook (React)** | hooks/*.ts | Extract component logic into reusable state containers |
| **Barrel Export** | models/index.ts, hooks/index.ts, components/index.ts | Clean public API, hide implementation details |
| **Type Guard** | config.ts | Runtime type validation (isUxLintConfig, isPage) |
| **Error Wrapping** | services/mcp-page-capture.ts | Translate low-level errors into domain-specific errors |

### 7.3 State Management Strategy

**React Hooks:**
- useAnalysis: Main orchestration, state = AnalysisState
- useConfig: Config loading, state = ConfigState
- useMcpClient: MCP client lifecycle, state = connection status
- useWizard: Config wizard, state = wizard progress

**No Redux/Context:** Components prop-drill or hook directly as needed
- Simpler for small app
- Good for UI → model data flow
- Potential issue: prop drilling for deep component trees (not present currently)

---

## 8. KEY FILES & THEIR RESPONSIBILITIES

### Core Domain Models
- **analysis.ts** (80 lines): AnalysisState, PageAnalysis, UxFinding, UxReport types + helper functions
- **config.ts** (129 lines): UxLintConfig types + type guards
- **config-io.ts** (404 lines): Filesystem I/O, parsing, validation, serialization

### Business Logic
- **ai-service.ts** (313 lines): Claude API integration, prompt building, response parsing
- **report-generator.ts** (179 lines): Markdown report generation
- **mcp-tool-adapter.ts** (102 lines): MCP tool → AI SDK conversion

### Application Orchestration
- **use-analysis.ts** (286 lines): Multi-page analysis workflow engine
- **use-config.ts** (112 lines): Config loading with React lifecycle

### Infrastructure
- **mcp-client.ts** (238 lines): MCP protocol client (stdio transport)
- **playwright-client.ts** (not fully read): Playwright MCP wrapper
- **mcp-page-capture.ts** (212 lines): High-level page capture service

### UI
- **analysis-runner.tsx** (83 lines): Analysis workflow component
- **config-wizard.tsx**: Interactive config creation
- **app.tsx** (172 lines): Mode routing, config loading UI

---

## 9. STRENGTHS OF THE ARCHITECTURE

1. **Clear Layer Separation**
   - Presentation, application, domain, infrastructure layers well-separated
   - Each layer has clear responsibilities

2. **No Circular Dependencies**
   - Strict unidirectional dependency graph
   - Easy to reason about module interactions

3. **Good Abstraction**
   - MCP client wrapped in PlaywrightClient → McpPageCapture
   - AI service abstracts Vercel SDK complexities
   - Config I/O separates read/parse/validate concerns

4. **React Hooks for State Management**
   - useAnalysis orchestrates complex multi-page workflow
   - useConfig manages async config loading with proper lifecycle

5. **Type Safety**
   - Strong typing throughout (TypeScript)
   - Type guards for runtime validation (config.ts)

6. **Separation of Concerns**
   - Models: Pure business logic (no I/O, no framework dependencies)
   - Services: External integrations
   - Hooks: Application state and orchestration
   - Components: UI only

---

## 10. POTENTIAL AREAS FOR IMPROVEMENT

1. **MCP Client Lifecycle in Hook**
   - useAnalysis directly creates McpPageCapture
   - Could be abstracted via useRef to dependency injection pattern
   - Currently tight coupling but acceptable for single-use flow

2. **Error Handling Standardization**
   - Multiple error types (NavigationError, SnapshotError, ConfigurationError, McpError)
   - Could benefit from error hierarchy or error middleware

3. **Service Layer Thin**
   - Only 2 service files (ai-service, mcp-page-capture)
   - Most business logic lives in hooks or models
   - Could consider moving more pure logic to services

4. **Configuration Complexity**
   - config-io.ts is 404 lines handling multiple concerns
   - Could split into separate modules: ConfigParser, ConfigValidator, ConfigSerializer

5. **MCP Tool Conversion**
   - mcp-tool-adapter.ts is somewhat ad-hoc
   - Could benefit from more robust schema validation and error handling

6. **Testing Boundary**
   - No circular deps makes testing easier
   - Domain models are testable (pure functions)
   - Hooks and services harder to test without full setup

---

## 11. SUMMARY: MODULE DEPENDENCIES

```
Entry Points:
  cli.tsx (48 lines)
  └── app.tsx (172 lines)
      ├── hooks/use-config.ts
      └── components/AnalysisRunner.tsx
          └── hooks/use-analysis.ts

Core Domain (Model Layer):
  models/config.ts (129 lines)
  models/analysis.ts (283 lines)
  models/config-io.ts (404 lines)
  models/errors.ts
  models/theme.ts
  models/report-generator.ts (179 lines)
  models/mcp-tool-adapter.ts (102 lines)
  [+ 7 more utility files]

Services (Adapter Layer):
  services/ai-service.ts (313 lines)
  services/mcp-page-capture.ts (212 lines)

Application Logic (Hooks):
  hooks/use-analysis.ts (286 lines)
  hooks/use-config.ts (112 lines)
  hooks/use-mcp-client.ts
  hooks/use-wizard.ts
  hooks/use-browser-automation.ts

UI Components:
  components/AnalysisRunner.tsx (83 lines)
  components/config-wizard.tsx
  [+ 5 more components]

Infrastructure (MCP Library):
  mcp/client/mcp-client.ts (238 lines)
  mcp/client/playwright-client.ts
  mcp/client/types.ts
  [+ 3 more client files]
```

---

## CONCLUSION

The uxlint codebase exhibits a **well-architected, modular design** with:
- ✓ Clear layering (presentation → application → domain → infrastructure)
- ✓ No circular dependencies
- ✓ Strong abstraction boundaries
- ✓ Unidirectional dependency flow
- ✓ Good separation of concerns

The main workflow (Config Loading → Analysis → Report Generation) flows cleanly through well-defined layers and makes appropriate use of React hooks for state management and orchestration.

**Recommendation:** This is a solid foundation. As the codebase grows, consider:
1. Further modularization of config-io.ts
2. More comprehensive error handling layer
3. Dependency injection for service initialization (reduce tight coupling in hooks)
4. Additional abstraction if MCP client usage expands beyond current scope

