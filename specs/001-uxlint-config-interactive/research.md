# Research Document: Playwright MCP Server and Client Integration

**Feature**: Playwright MCP Server and Client Integration
**Branch**: `001-uxlint-config-interactive`
**Date**: 2025-10-12

## Executive Summary

This research consolidates findings on implementing an MCP client in uxlint to communicate with the official Playwright MCP server (`@playwright/mcp`) for browser automation. The research covers MCP architecture, TypeScript SDK usage, and code organization patterns for React/Ink applications.

## 1. Technology Decisions

### MCP TypeScript SDK

**Package**: `@modelcontextprotocol/sdk` (v1.20.0+)

**Official Documentation Source**: Retrieved from context7 MCP SDK documentation

**Key Components**:
```typescript
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
```

**Protocol Structure**:
- **Client**: Connects to MCP servers, invokes tools
- **Transport**: stdio (for local processes spawned via npx)
- **Tools**: Browser automation operations (navigate, screenshot, evaluate, etc.)

### Official SDK Examples (from context7)

#### Example 1: Basic Stdio Client Connection

**Source**: MCP TypeScript SDK official documentation

```typescript
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const client = new Client({
  name: 'stdio-client',
  version: '1.0.0'
});

// Spawn server process and connect via stdio
const transport = new StdioClientTransport({
  command: 'node',
  args: ['server.js']
});

await client.connect(transport);

const result = await client.callTool({
  name: 'get-time',
  arguments: {}
});
console.log('Server time:', result.structuredContent);

await client.close();
```

**Key Patterns**:
- Create `Client` instance with name and version
- Create `StdioClientTransport` with command and args
- Call `connect()` to establish connection
- Use `callTool()` to invoke server tools
- Call `close()` to cleanup

#### Example 2: Listing Available Tools

**Source**: MCP TypeScript SDK official documentation

```typescript
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const transport = new StdioClientTransport({
  command: 'node',
  args: ['server.js']
});

const client = new Client({
  name: 'example-client',
  version: '1.0.0'
});

await client.connect(transport);

// List prompts
const prompts = await client.listPrompts();

// Get a prompt
const prompt = await client.getPrompt({
  name: 'example-prompt',
  arguments: {
    arg1: 'value'
  }
});

// List resources
const resources = await client.listResources();

// Read a resource
const resource = await client.readResource({
  uri: 'file:///example.txt'
});

// Call a tool
const result = await client.callTool({
  name: 'example-tool',
  arguments: {
    arg1: 'value'
  }
});
```

**Key Operations**:
- `listPrompts()`: Discover available prompts
- `getPrompt()`: Get specific prompt
- `listResources()`: Discover available resources
- `readResource()`: Read resource content
- `callTool()`: Invoke tool with arguments

#### Example 3: Server Connection with Capabilities

**Source**: MCP TypeScript SDK official documentation

```typescript
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const client = new Client(
  {
    name: 'example-client',
    version: '1.0.0'
  },
  {
    capabilities: {
      tools: {},      // Client supports tools
      resources: {},  // Client supports resources
      prompts: {}     // Client supports prompts
    }
  }
);

const transport = new StdioClientTransport({
  command: 'node',
  args: ['server.js']
});

await client.connect(transport);
```

**Capabilities Declaration**:
- Declares what protocol features the client supports
- Server can adapt behavior based on client capabilities
- Empty objects `{}` indicate support without additional configuration

### Playwright MCP Server

**Package**: `@playwright/mcp` (v0.0.42+, Microsoft Official)

**Official Repository**: https://github.com/microsoft/playwright-mcp

**Launch Command**:
```bash
npx @playwright/mcp@latest --browser chrome --headless
```

**Available Tools** (from official README):
- `browser_navigate`: Navigate to URLs
- `browser_snapshot`: Get accessibility tree (preferred over screenshots)
- `browser_take_screenshot`: Capture visual representation
- `browser_click`: Click elements
- `browser_fill_form`: Fill form fields
- `browser_evaluate`: Execute JavaScript
- `browser_close`: Close browser session
- `browser_console_messages`: Get console logs
- `browser_network_requests`: List network requests

**Key Features**:
- Uses Playwright's accessibility tree (structured data, not pixel-based)
- LLM-friendly output format
- Deterministic tool application
- Supports multiple browsers (Chrome, Firefox, WebKit, Edge)
- Headless and headed modes

#### Example: Using Playwright MCP with MCP Client

**Integration Pattern** (combining SDK examples with Playwright server):

```typescript
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

// Create client
const client = new Client({
  name: 'uxlint',
  version: '1.0.0'
}, {
  capabilities: {
    tools: {}  // We only need tools capability
  }
});

// Connect to Playwright MCP server via stdio
const transport = new StdioClientTransport({
  command: 'npx',
  args: ['@playwright/mcp@latest', '--browser', 'chrome', '--headless']
});

await client.connect(transport);

// Navigate to a page
const navResult = await client.callTool({
  name: 'browser_navigate',
  arguments: { url: 'https://example.com' }
});

// Get accessibility snapshot
const snapshot = await client.callTool({
  name: 'browser_snapshot',
  arguments: {}
});

// Take screenshot
const screenshot = await client.callTool({
  name: 'browser_take_screenshot',
  arguments: { fullPage: true }
});

// Execute JavaScript
const pageTitle = await client.callTool({
  name: 'browser_evaluate',
  arguments: {
    function: '() => document.title'
  }
});

// Cleanup
await client.callTool({
  name: 'browser_close',
  arguments: {}
});

await client.close();
```

**Tool Result Format**:
```typescript
// browser_navigate result
interface NavigateResult {
  success: boolean;
  url: string;
  title?: string;
  status?: number;
}

// browser_snapshot result
interface SnapshotResult {
  snapshot: string;  // Accessibility tree as JSON string
}

// browser_take_screenshot result
interface ScreenshotResult {
  screenshot: string;  // Base64-encoded image
  width: number;
  height: number;
  format?: 'png' | 'jpeg';
}
```

## 2. Architecture

**Pattern**: Models → Hooks → Components

```
source/
├── mcp/
│   └── client/
│       ├── mcp-client.ts          # Core MCP client
│       ├── playwright-client.ts   # Playwright wrapper
│       ├── types.ts                # Type definitions
│       └── errors.ts               # Error classes
├── hooks/
│   ├── use-mcp-client.ts          # Connection lifecycle
│   └── use-browser-automation.ts  # Browser operations
└── components/
    └── [...Ink components]
```

## 3. Implementation

### MCPClient (source/mcp/client/mcp-client.ts)

```typescript
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

export class MCPClient {
  private client: Client;
  private transport: StdioClientTransport | null = null;
  private connected = false;

  constructor(name: string, version: string) {
    this.client = new Client({ name, version }, {
      capabilities: { tools: {}, resources: {}, prompts: {} }
    });
  }

  async connect(serverCommand: string, serverArgs: string[]): Promise<void> {
    if (this.connected) throw new Error('Client already connected');

    this.transport = new StdioClientTransport({
      command: serverCommand,
      args: serverArgs
    });

    await this.client.connect(this.transport);
    this.connected = true;
  }

  async callTool<T>(name: string, args: Record<string, unknown>): Promise<T> {
    if (!this.connected) throw new Error('Client not connected');

    const result = await this.client.callTool({ name, arguments: args });
    return result as T;
  }

  async close(): Promise<void> {
    if (this.connected && this.transport) {
      await this.client.close();
      this.connected = false;
      this.transport = null;
    }
  }

  isConnected(): boolean {
    return this.connected;
  }
}
```

### PlaywrightClient (source/mcp/client/playwright-client.ts)

```typescript
import { MCPClient } from './mcp-client.js';

export interface NavigateResult {
  success: boolean;
  url: string;
}

export interface ScreenshotResult {
  screenshot: string; // base64
  width: number;
  height: number;
}

export class PlaywrightClient {
  constructor(private mcpClient: MCPClient) {}

  async navigate(url: string): Promise<NavigateResult> {
    return this.mcpClient.callTool<NavigateResult>('browser_navigate', { url });
  }

  async screenshot(): Promise<ScreenshotResult> {
    return this.mcpClient.callTool<ScreenshotResult>('browser_take_screenshot', {});
  }

  async getSnapshot(): Promise<{ snapshot: string }> {
    return this.mcpClient.callTool('browser_snapshot', {});
  }

  async evaluate(script: string): Promise<unknown> {
    return this.mcpClient.callTool('browser_evaluate', { function: script });
  }

  async close(): Promise<void> {
    await this.mcpClient.callTool('browser_close', {});
  }
}
```

### useMCPClient Hook (source/hooks/use-mcp-client.ts)

```typescript
import { useState, useEffect, useCallback } from 'react';
import { MCPClient } from '../mcp/client/mcp-client.js';

export interface UseMCPClientOptions {
  serverCommand: string;
  serverArgs: string[];
  autoConnect?: boolean;
}

export function useMCPClient(options: UseMCPClientOptions) {
  const [client, setClient] = useState<MCPClient | null>(null);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const connect = useCallback(async () => {
    try {
      const newClient = new MCPClient('uxlint', '1.0.0');
      await newClient.connect(options.serverCommand, options.serverArgs);
      setClient(newClient);
      setConnected(true);
      setError(null);
    } catch (err) {
      setError(err as Error);
      setConnected(false);
    }
  }, [options.serverCommand, options.serverArgs]);

  useEffect(() => {
    if (options.autoConnect) connect();
    return () => { if (client) client.close().catch(console.error); };
  }, [options.autoConnect, connect, client]);

  return { client, connected, error, connect };
}
```

### useBrowserAutomation Hook (source/hooks/use-browser-automation.ts)

```typescript
import { useState, useCallback, useEffect } from 'react';
import { PlaywrightClient } from '../mcp/client/playwright-client.js';
import { useMCPClient } from './use-mcp-client.js';

export function useBrowserAutomation() {
  const [playwrightClient, setPlaywrightClient] = useState<PlaywrightClient | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const { client, connected } = useMCPClient({
    serverCommand: 'npx',
    serverArgs: ['@playwright/mcp@latest', '--browser', 'chrome', '--headless'],
    autoConnect: true
  });

  useEffect(() => {
    if (client && connected) {
      setPlaywrightClient(new PlaywrightClient(client));
    }
  }, [client, connected]);

  const navigate = useCallback(async (url: string) => {
    if (!playwrightClient) throw new Error('Client not initialized');
    setLoading(true);
    setError(null);
    try {
      await playwrightClient.navigate(url);
    } catch (err) {
      setError(err as Error);
      throw err;
    } finally {
      setLoading(false);
    }
  }, [playwrightClient]);

  const screenshot = useCallback(async () => {
    if (!playwrightClient) throw new Error('Client not initialized');
    setLoading(true);
    try {
      const result = await playwrightClient.screenshot();
      return result.screenshot;
    } finally {
      setLoading(false);
    }
  }, [playwrightClient]);

  return { navigate, screenshot, loading, error };
}
```

## 4. Error Handling

```typescript
// source/mcp/client/errors.ts
export class MCPError extends Error {
  constructor(message: string, public readonly code: string) {
    super(message);
    this.name = 'MCPError';
  }
}

export class ConnectionError extends MCPError {
  constructor(message: string) {
    super(message, 'CONNECTION_ERROR');
    this.name = 'ConnectionError';
  }
}

export class ToolInvocationError extends MCPError {
  constructor(message: string, public readonly toolName: string) {
    super(message, 'TOOL_INVOCATION_ERROR');
    this.name = 'ToolInvocationError';
  }
}
```

## 5. Testing

### Unit Tests (Ava)

```typescript
// tests/mcp/client/mcp-client.spec.ts
import test from 'ava';
import { MCPClient } from '../../../source/mcp/client/mcp-client.js';

test('MCPClient connects to server', async t => {
  const client = new MCPClient('test-client', '1.0.0');
  await client.connect('npx', ['@playwright/mcp@latest']);
  t.true(client.isConnected());
  await client.close();
});
```

### Component Tests (ink-testing-library)

```typescript
// tests/components/browser-panel.spec.tsx
import test from 'ava';
import { render } from 'ink-testing-library';
import React from 'react';
import { BrowserPanel } from '../../source/components/browser-panel.js';

test('BrowserPanel renders loading state', t => {
  const { lastFrame } = render(<BrowserPanel loading={true} url="" />);
  t.true(lastFrame()!.includes('Loading'));
});
```

## 6. Configuration

```typescript
// source/mcp/client/config.ts
export interface MCPConfig {
  serverCommand: string;
  serverArgs: string[];
  browser: 'chrome' | 'firefox' | 'webkit' | 'msedge';
  headless: boolean;
  timeout: number;
}

export const defaultMCPConfig: MCPConfig = {
  serverCommand: 'npx',
  serverArgs: ['@playwright/mcp@latest'],
  browser: 'chrome',
  headless: true,
  timeout: 30000
};
```

**Environment Variables**:
- `MCP_BROWSER`: Browser type (default: 'chrome')
- `MCP_HEADLESS`: Headless mode (default: 'true')
- `MCP_TIMEOUT`: Timeout in ms (default: '30000')

## 7. Dependencies

```json
{
  "dependencies": {
    "@modelcontextprotocol/sdk": "^1.20.0"
  },
  "devDependencies": {
    "@types/node": "^18.18.0"
  }
}
```

**Installation**:
```bash
npm install @modelcontextprotocol/sdk
npx @playwright/mcp@latest --help  # Verify server availability
```

## 8. References

- MCP Specification: https://modelcontextprotocol.io/specification/latest
- MCP TypeScript SDK: https://github.com/modelcontextprotocol/typescript-sdk
- Playwright MCP Server: https://github.com/microsoft/playwright-mcp
- Ava Testing: https://github.com/avajs/ava
- ink-testing-library: https://github.com/vadimdemedes/ink-testing-library
