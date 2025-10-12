# Data Model: Playwright MCP Server and Client Integration

**Feature**: Playwright MCP Server and Client Integration
**Branch**: `001-uxlint-config-interactive`
**Date**: 2025-10-12

## Overview

This document defines the data models and domain entities for the MCP client integration. These models represent the core business logic independent of UI or infrastructure concerns.

## Core Entities

### 1. MCPClient

**Purpose**: Manages connection and communication with MCP servers

**Attributes**:
| Attribute | Type | Required | Description | Validation Rules |
|-----------|------|----------|-------------|------------------|
| name | string | Yes | Client identifier | Non-empty, alphanumeric + hyphens |
| version | string | Yes | Client version (semver) | Valid semver format (x.y.z) |
| connected | boolean | Yes | Connection state | Read-only, managed internally |
| transport | StdioClientTransport \| null | Yes | Communication channel | Null when disconnected |
| client | Client | Yes | MCP SDK client instance | Internal, not exposed |

**State Transitions**:
```
[Disconnected] --connect()-->  [Connected]

[Connected] --close()--> [Disconnected]

[Connected] --error--> [Error] --reconnect()--> [Connected]
```

**Invariants**:
- Client can only be connected to one server at a time
- `connected` must be `true` before calling `listTools()` or `callTool()`
- `transport` must be non-null when `connected` is `true`

**Methods**:
- `connect(command: string, args: string[]): Promise<void>`
- `listTools(): Promise<Tool[]>`
- `callTool<T>(name: string, args: Record<string, unknown>): Promise<T>`
- `close(): Promise<void>`
- `isConnected(): boolean`

---

### 2. PlaywrightClient

**Purpose**: Provides typed wrappers for Playwright MCP server tools

**Attributes**:
| Attribute | Type | Required | Description | Validation Rules |
|-----------|------|----------|-------------|------------------|
| mcpClient | MCPClient | Yes | Underlying MCP client | Must be connected |

**Methods**:
- `navigate(url: string): Promise<NavigateResult>`
- `screenshot(): Promise<ScreenshotResult>`
- `getSnapshot(): Promise<SnapshotResult>`
- `click(selector: string): Promise<void>`
- `fillForm(fields: Record<string, string>): Promise<void>`
- `evaluate(script: string): Promise<unknown>`
- `close(): Promise<void>`

**Invariants**:
- `mcpClient` must be in connected state
- All methods validate parameters before invocation
- Timeout enforced on all tool calls (30s default)

---

### 3. Tool

**Purpose**: Represents an MCP tool exposed by the server

**Attributes**:
| Attribute | Type | Required | Description | Validation Rules |
|-----------|------|----------|-------------|------------------|
| name | string | Yes | Unique tool identifier | Non-empty, kebab-case |
| description | string | No | Human-readable description | - |
| inputSchema | object | Yes | JSON Schema for parameters | Valid JSON Schema |
| outputSchema | object | No | JSON Schema for results | Valid JSON Schema |

**Example**:
```typescript
{
  name: "browser_navigate",
  description: "Navigate to a URL",
  inputSchema: {
    type: "object",
    properties: {
      url: { type: "string", format: "uri" }
    },
    required: ["url"]
  }
}
```

---

### 4. NavigateResult

**Purpose**: Result of page navigation operation

**Attributes**:
| Attribute | Type | Required | Description | Validation Rules |
|-----------|------|----------|-------------|------------------|
| success | boolean | Yes | Navigation succeeded | - |
| url | string | Yes | Final URL after redirects | Valid URL |
| title | string | No | Page title | - |
| status | number | No | HTTP status code | 100-599 |

**Validation**:
- `url` must be valid URI
- `status` must be valid HTTP status code if present

---

### 5. ScreenshotResult

**Purpose**: Result of screenshot capture operation

**Attributes**:
| Attribute | Type | Required | Description | Validation Rules |
|-----------|------|----------|-------------|------------------|
| screenshot | string | Yes | Base64-encoded image | Non-empty, valid base64 |
| width | number | Yes | Image width in pixels | > 0 |
| height | number | Yes | Image height in pixels | > 0 |
| format | 'png' \| 'jpeg' | No | Image format | Default: 'png' |

**Validation**:
- `screenshot` must be valid base64 string
- `width` and `height` must be positive integers
- Image size must be reasonable (< 10MB encoded)

---

### 6. SnapshotResult

**Purpose**: Result of accessibility tree snapshot operation

**Attributes**:
| Attribute | Type | Required | Description | Validation Rules |
|-----------|------|----------|-------------|------------------|
| snapshot | string | Yes | Accessibility tree JSON | Valid JSON string |
| timestamp | number | No | Capture timestamp (ms) | Positive integer |

**Validation**:
- `snapshot` must be valid JSON
- JSON must conform to accessibility tree schema

---

### 7. MCPConfig

**Purpose**: Configuration for MCP client behavior

**Attributes**:
| Attribute | Type | Required | Description | Validation Rules | Default |
|-----------|------|----------|-------------|------------------|---------|
| serverCommand | string | Yes | Server executable path | Non-empty | 'npx' |
| serverArgs | string[] | Yes | Server launch arguments | - | ['@playwright/mcp@latest'] |
| browser | BrowserType | Yes | Browser to use | Valid browser type | 'chrome' |
| headless | boolean | Yes | Run in headless mode | - | true |
| timeout | number | Yes | Tool invocation timeout (ms) | > 0, ≤ 300000 | 30000 |

**Type Definitions**:
```typescript
type BrowserType = 'chrome' | 'firefox' | 'webkit' | 'msedge';
```

**Validation**:
- `timeout` must be between 1000ms and 300000ms (5 minutes max)
- `serverCommand` must be executable or in PATH
- `serverArgs` must not contain malicious commands

---

### 8. MCPError Hierarchy

**Purpose**: Type-safe error handling for MCP operations

#### MCPError (Base)

| Attribute | Type | Required | Description |
|-----------|------|----------|-------------|
| message | string | Yes | Error message |
| code | string | Yes | Error code |
| name | string | Yes | Error class name |

#### ConnectionError

**When**: Server connection fails

| Attribute | Type | Required | Description |
|-----------|------|----------|-------------|
| code | string | Yes | Always 'CONNECTION_ERROR' |
| serverCommand | string | No | Command that failed |

#### ToolInvocationError

**When**: Tool execution fails

| Attribute | Type | Required | Description |
|-----------|------|----------|-------------|
| code | string | Yes | Always 'TOOL_INVOCATION_ERROR' |
| toolName | string | Yes | Name of failed tool |
| toolArgs | object | No | Arguments passed to tool |

#### ServerNotAvailableError

**When**: Server is not running or unreachable

| Attribute | Type | Required | Description |
|-----------|------|----------|-------------|
| code | string | Yes | Always 'SERVER_NOT_AVAILABLE' |

#### TimeoutError

**When**: Tool invocation exceeds timeout

| Attribute | Type | Required | Description |
|-----------|------|----------|-------------|
| code | string | Yes | Always 'TIMEOUT_ERROR' |
| toolName | string | Yes | Name of timed-out tool |
| timeout | number | Yes | Timeout value in ms |

---

## Relationships

```
┌───────────────┐
│   MCPClient   │◄─────────────┐
└───────┬───────┘              │
        │ 1                    │ uses
        │                      │
        │ uses             ┌───┴────────────┐
        ▼                  │ PlaywrightClient│
┌───────────────┐          └────────────────┘
│     Tool      │
└───────────────┘
        │
        │ returns
        ▼
┌───────────────────────┐
│  NavigateResult       │
│  ScreenshotResult     │
│  SnapshotResult       │
└───────────────────────┘

┌───────────────┐
│   MCPConfig   │
└───────────────┘
        │
        │ configures
        ▼
┌───────────────┐
│   MCPClient   │
└───────────────┘

┌───────────────┐
│   MCPError    │◄─── thrown by ───┐
└───────┬───────┘                  │
        │                          │
        ├── ConnectionError         │
        ├── ToolInvocationError    │
        ├── ServerNotAvailableError│
        └── TimeoutError           │
                                   │
                        ┌──────────┴───────┐
                        │ MCPClient        │
                        │ PlaywrightClient │
                        └──────────────────┘
```

---

## Value Objects

### 1. StdioTransportConfig

**Purpose**: Configuration for stdio transport

```typescript
interface StdioTransportConfig {
  command: string;           // Executable command
  args: string[];            // Command arguments
  env?: Record<string, string>; // Environment variables
  cwd?: string;              // Working directory
}
```

### 2. ToolInvocation

**Purpose**: Represents a tool invocation request

```typescript
interface ToolInvocation {
  name: string;              // Tool name
  arguments: Record<string, unknown>; // Tool parameters
  timeout?: number;          // Override default timeout
}
```

### 3. ToolResult

**Purpose**: Generic tool invocation result

```typescript
interface ToolResult<T = unknown> {
  content: Content[];        // Result content
  isError?: boolean;         // Indicates error
}

interface Content {
  type: 'text' | 'resource' | 'image';
  text?: string;
  data?: string;
  mimeType?: string;
}
```

---

## Validation Rules

### URL Validation
- Must start with `http://` or `https://`
- Must be valid according to WHATWG URL Standard
- Domain must be resolvable (optional check)

### Selector Validation
- Non-empty string
- Valid CSS selector syntax
- No XPath (not supported by accessibility tree)

### Script Validation
- Non-empty string
- Basic safety checks (no `require`, `import`, `eval`)
- Length limit: 10,000 characters

### Timeout Validation
- Minimum: 1000ms (1 second)
- Maximum: 300000ms (5 minutes)
- Default: 30000ms (30 seconds)

---

## Data Flow

### Connection Flow
```
User Code
    │
    ▼
useMCPClient Hook
    │
    ▼
MCPClient.connect()
    │
    ├─► Create StdioClientTransport
    ├─► Start server subprocess
    ├─► Perform MCP handshake
    └─► Set connected = true
```

### Tool Invocation Flow
```
User Code
    │
    ▼
useBrowserAutomation Hook
    │
    ▼
PlaywrightClient.navigate()
    │
    ▼
MCPClient.callTool('browser_navigate', {url})
    │
    ├─► Validate parameters
    ├─► Send tool invocation via transport
    ├─► Wait for response (with timeout)
    └─► Parse and return NavigateResult
```

### Error Flow
```
Tool Invocation
    │
    ├─► Server unavailable ──► ServerNotAvailableError
    ├─► Connection lost ────► ConnectionError
    ├─► Timeout exceeded ───► TimeoutError
    ├─► Invalid parameters ─► ToolInvocationError
    └─► Tool execution fail ► ToolInvocationError
```

---

## Persistence

**Storage**: None required - all state is in-memory for session duration

**Rationale**:
- MCP client connection is ephemeral (per CLI session)
- Browser state is managed by Playwright server
- No need to persist tool results
- Configuration loaded from environment/files each session

---

## Performance Considerations

### Memory Management
- Tool results returned as streams where possible
- Screenshots: Max 10MB base64 (enforced)
- Snapshots: Max 5MB JSON (enforced)
- Connection cleanup on session end

### Caching Strategy
- **No caching** in initial implementation (Constitution V: Simplicity)
- Tool discovery results: Cached per connection
- Tool results: Not cached (always fresh data)

### Concurrency Model
- Sequential tool invocations only
- Single MCP client instance per session
- No parallel browser operations
- Async operations use promises (non-blocking I/O)

---

## Testing Strategy

### Unit Tests (Ava)

**MCPClient**:
- Connection establishment
- Tool discovery
- Tool invocation with various parameter types
- Error handling for all error types
- Connection cleanup

**PlaywrightClient**:
- Each tool method with valid parameters
- Parameter validation
- Error propagation from MCPClient
- Timeout behavior

**Error Classes**:
- Error construction with correct properties
- Error inheritance hierarchy
- Error serialization

**Config**:
- Default values
- Environment variable override
- Validation rules

### Integration Tests

**MCP Integration**:
- Connect to real Playwright MCP server
- Invoke actual browser navigation
- Capture screenshots and snapshots
- Handle server failures gracefully

**Performance Tests**:
- Session initialization < 5s
- Tool invocation latencies
- Memory usage over 50 operations
- Connection recovery timing

---

## Security Model

### Input Validation
- All URLs validated against WHATWG URL standard
- Selectors sanitized (CSS only, no XPath)
- Scripts validated (basic safety checks)
- No user-provided server commands

### Subprocess Safety
- Server command hardcoded or from trusted config
- Arguments validated (no shell injection)
- Process isolation via stdio
- Cleanup on termination

### Data Handling
- Screenshots: Validated base64
- Snapshots: Validated JSON
- No sensitive data logged
- Error messages sanitized (no stack traces to user)

---

## AI SDK Integration Entities

### 9. UXAnalysisConfig

**Purpose**: Configuration for AI-powered UX analysis

**Attributes**:
| Attribute | Type | Required | Description | Validation Rules |
|-----------|------|----------|-------------|------------------|
| url | string | Yes | Page URL to analyze | Valid URL |
| personas | Persona[] | Yes | Target user personas | At least one persona |
| focusAreas | string[] | No | Specific UX areas to focus on | - |
| aiProvider | AIProvider | Yes | AI model provider | Valid provider type |
| aiModel | string | No | Specific model name | Provider-compatible model |

**Type Definitions**:
```typescript
interface Persona {
  name: string;
  description: string;
  goals: string[];
}

type AIProvider = 'openai' | 'anthropic' | 'google';
```

**Validation**:
- At least one persona required
- Each persona must have at least one goal
- focusAreas optional but if provided must be non-empty strings

---

### 10. AIToolDefinition

**Purpose**: Bridge definition between MCP tools and AI SDK tools

**Attributes**:
| Attribute | Type | Required | Description | Validation Rules |
|-----------|------|----------|-------------|------------------|
| mcpToolName | string | Yes | MCP tool name | Non-empty, kebab-case |
| aiToolName | string | Yes | AI-visible tool name | CamelCase, descriptive |
| description | string | Yes | Tool purpose for AI | Clear, actionable description |
| inputSchema | ZodObject | Yes | Zod schema for validation | Valid Zod object schema |

**Example**:
```typescript
{
  mcpToolName: 'browser_navigate',
  aiToolName: 'navigateToPage',
  description: 'Navigate to a web page URL to begin analysis',
  inputSchema: z.object({
    url: z.string().url().describe('The URL to navigate to')
  })
}
```

---

### 11. UXAnalysisResult

**Purpose**: Result of AI-powered UX analysis

**Attributes**:
| Attribute | Type | Required | Description | Validation Rules |
|-----------|------|----------|-------------|------------------|
| url | string | Yes | Analyzed page URL | Valid URL |
| analysisText | string | Yes | Complete analysis text | Non-empty |
| toolCalls | ToolCallRecord[] | Yes | Tools invoked during analysis | - |
| personas | string[] | Yes | Personas analyzed for | At least one |
| timestamp | number | Yes | Analysis completion time | Unix timestamp |
| duration | number | Yes | Analysis duration (ms) | > 0 |

**Type Definitions**:
```typescript
interface ToolCallRecord {
  id: string;
  name: string;
  timestamp: number;
  duration: number;
  status: 'success' | 'error';
  error?: string;
}
```

---

### 12. AIStreamPart

**Purpose**: Represents parts of AI streaming response

**Type Definitions**:
```typescript
type AIStreamPart =
  | { type: 'tool-call'; toolCallId: string; toolName: string; input: object }
  | { type: 'tool-result'; toolCallId: string; toolName: string; result: unknown }
  | { type: 'text-delta'; textDelta: string }
  | { type: 'finish'; finishReason: string }
  | { type: 'error'; error: string };
```

**Usage**: Streamed from AI SDK's `fullStream` iterator for real-time UI updates

---

## Updated Relationships

```
┌───────────────┐
│ UXAnalysisConfig│
└───────┬───────┘
        │ configures
        ▼
┌─────────────────┐
│  UXAnalyzer     │────► uses ────► ┌──────────────┐
│  (Domain Model) │                 │ AIProvider   │
└────────┬────────┘                 │ (openai/etc) │
         │                          └──────────────┘
         │ creates
         ▼
┌─────────────────┐
│ AIToolDefinition│
│ (Bridge)        │
└────────┬────────┘
         │ wraps
         ▼
┌─────────────────┐
│ MCPClient       │────► calls ────► ┌──────────────┐
│                 │                   │ Playwright   │
└─────────────────┘                   │ MCP Server   │
         │                            └──────────────┘
         │ returns
         ▼
┌─────────────────┐
│ AIStreamPart    │
│ (streaming)     │
└────────┬────────┘
         │ accumulates to
         ▼
┌─────────────────┐
│ UXAnalysisResult│
└─────────────────┘
```

---

## Updated Data Flow

### AI-Powered Analysis Flow
```
User Code
    │
    ▼
useUXAnalysis Hook
    │
    ▼
analyzeUX(config)
    │
    ├─► Connect MCPClient
    ├─► Create AI tools from MCP tools
    ├─► Call streamText() with tools
    └─► For each AI stream part:
        ├─► tool-call → Execute MCP tool
        ├─► tool-result → Accumulate data
        ├─► text-delta → Update UI
        └─► finish → Complete analysis
```

### Tool Bridging Flow
```
AI Model
    │
    ▼ (decides to call tool)
AI SDK Tool Call
    │
    ▼
createAIToolFromMCP adapter
    │
    ▼
MCPClient.callTool()
    │
    ▼
Playwright MCP Server
    │
    ▼ (returns result)
AI SDK Tool Result
    │
    ▼
AI Model (continues analysis)
```

---

## Future Enhancements

### Not in Current Scope
1. **State Persistence**: Save/restore browser state
2. **Parallel Execution**: Multiple browser contexts
3. **Result Caching**: Cache tool results for performance
4. **Advanced Selectors**: XPath support
5. **Custom Tools**: User-defined MCP tools
6. **Metrics Collection**: Performance monitoring
7. **Connection Pooling**: Multiple MCP clients
8. **Multi-Model Analysis**: Compare results from different AI models
9. **Analysis History**: Store and compare historical analyses

### Extension Points
- `Tool` interface can be extended with custom tools
- `MCPConfig` can add new browser options
- Error hierarchy can add new error types
- Transport can support HTTP in addition to stdio
- `AIProvider` can add new providers (Cohere, Mistral, etc.)
- `UXAnalysisConfig` can add analysis templates

---

## References

- MCP Specification: https://modelcontextprotocol.io/specification/latest
- Vercel AI SDK: https://sdk.vercel.ai/docs
- Playwright Accessibility Tree: https://playwright.dev/docs/accessibility-testing
- JSON Schema Validation: https://json-schema.org/
- WHATWG URL Standard: https://url.spec.whatwg.org/
- Zod Validation: https://zod.dev/
