# Quick Start Guide: Playwright MCP Integration

**Feature**: Playwright MCP Server and Client Integration
**Branch**: `001-uxlint-config-interactive`
**Date**: 2025-10-12

## Overview

This guide helps developers quickly understand and implement the Playwright MCP client integration in uxlint. Follow these steps to get browser automation capabilities up and running.

## Prerequisites

- Node.js >= 18.18.0
- npm or yarn package manager
- Basic understanding of TypeScript and React hooks
- Familiarity with uxlint codebase

## Installation

### 1. Install Dependencies

```bash
# Install MCP SDK
npm install @modelcontextprotocol/sdk

# Verify Playwright MCP server is accessible
npx @playwright/mcp@latest --help
```

### 2. Install AI SDK Dependencies

```bash
# Install Vercel AI SDK
npm install ai @ai-sdk/openai @ai-sdk/anthropic zod

# Install Ink components
npm install ink ink-spinner
```

### 3. Verify Installation

```bash
# Should show available browser automation tools
npx @playwright/mcp@latest --browser chrome --headless &
# Press Ctrl+C to stop
```

## Architecture Overview

```
┌─────────────────┐
│   Component     │  (UI Layer - Ink/React)
│   (app.tsx)     │
└────────┬────────┘
         │ uses
         ▼
┌──────────────────────┐
│  Custom Hook         │  (Integration Layer)
│  useBrowserAutomation│
└────────┬─────────────┘
         │ uses
         ▼
┌──────────────────────┐
│  Domain Model        │  (Business Logic)
│  PlaywrightClient    │
└────────┬─────────────┘
         │ uses
         ▼
┌──────────────────────┐
│  MCP Client          │  (Protocol Layer)
│  MCPClient           │
└────────┬─────────────┘
         │ stdio
         ▼
┌──────────────────────┐
│  Playwright MCP      │  (External Process)
│  Server              │
└──────────────────────┘
```

## Basic Usage

### Step 1: Create MCP Client (Domain Logic)

**File**: `source/mcp/client/mcp-client.ts`

```typescript
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

export class MCPClient {
  private client: Client;
  private transport: StdioClientTransport | null = null;
  private connected = false;

  constructor(name: string, version: string) {
    this.client = new Client(
      { name, version },
      { capabilities: { tools: {}, resources: {}, prompts: {} } }
    );
  }

  async connect(serverCommand: string, serverArgs: string[]): Promise<void> {
    this.transport = new StdioClientTransport({
      command: serverCommand,
      args: serverArgs
    });
    await this.client.connect(this.transport);
    this.connected = true;
  }

  async callTool<T>(name: string, args: Record<string, unknown>): Promise<T> {
    const result = await this.client.callTool({ name, arguments: args });
    return result as T;
  }

  async close(): Promise<void> {
    if (this.connected && this.transport) {
      await this.client.close();
      this.connected = false;
    }
  }

  isConnected(): boolean {
    return this.connected;
  }
}
```

### Step 2: Create Playwright Wrapper (Domain Logic)

**File**: `source/mcp/client/playwright-client.ts`

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
    return this.mcpClient.callTool<ScreenshotResult>('browser_screenshot', {});
  }
}
```

### Step 3: Create Custom Hook (Integration Layer)

**File**: `source/hooks/use-browser-automation.ts`

```typescript
import { useState, useCallback, useEffect } from 'react';
import { MCPClient } from '../mcp/client/mcp-client.js';
import { PlaywrightClient } from '../mcp/client/playwright-client.js';

export function useBrowserAutomation() {
  const [client, setClient] = useState<PlaywrightClient | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    // Initialize MCP client on mount
    const mcpClient = new MCPClient('uxlint', '1.0.0');

    mcpClient.connect('npx', ['@playwright/mcp@latest', '--browser', 'chrome', '--headless'])
      .then(() => {
        setClient(new PlaywrightClient(mcpClient));
      })
      .catch(setError);

    return () => {
      mcpClient.close().catch(console.error);
    };
  }, []);

  const navigate = useCallback(async (url: string) => {
    if (!client) throw new Error('Client not initialized');

    setLoading(true);
    setError(null);

    try {
      await client.navigate(url);
    } catch (err) {
      setError(err as Error);
      throw err;
    } finally {
      setLoading(false);
    }
  }, [client]);

  const screenshot = useCallback(async () => {
    if (!client) throw new Error('Client not initialized');

    setLoading(true);
    setError(null);

    try {
      const result = await client.screenshot();
      return result.screenshot;
    } catch (err) {
      setError(err as Error);
      throw err;
    } finally {
      setLoading(false);
    }
  }, [client]);

  return { navigate, screenshot, loading, error };
}
```

### Step 4: Use in Component (UI Layer)

**File**: `source/app.tsx` (add to existing component)

```typescript
import { useBrowserAutomation } from './hooks/use-browser-automation.js';

export default function App() {
  const { navigate, screenshot, loading, error } = useBrowserAutomation();

  const handleAnalyze = async (url: string) => {
    try {
      // Navigate to URL
      await navigate(url);

      // Capture screenshot
      const image = await screenshot();

      // Process image for UX analysis (future feature)
      console.log('Screenshot captured:', image.substring(0, 50) + '...');
    } catch (err) {
      console.error('Analysis failed:', err);
    }
  };

  return (
    <Box flexDirection="column">
      {loading && <Text color="yellow">Loading...</Text>}
      {error && <Text color="red">Error: {error.message}</Text>}
      {/* Your existing UI components */}
    </Box>
  );
}
```

## Testing

### Unit Test Example (Ava)

**File**: `tests/mcp/client/mcp-client.spec.ts`

```typescript
import test from 'ava';
import { MCPClient } from '../../../source/mcp/client/mcp-client.js';

test('MCPClient connects to server', async t => {
  const client = new MCPClient('test-client', '1.0.0');

  await client.connect('npx', ['@playwright/mcp@latest']);

  t.true(client.isConnected());

  await client.close();
});
```

### Component Test Example (ink-testing-library)

**File**: `tests/hooks/use-browser-automation.spec.ts`

```typescript
import test from 'ava';
import { renderHook, waitFor } from '@testing-library/react-hooks';
import { useBrowserAutomation } from '../../source/hooks/use-browser-automation.js';

test('useBrowserAutomation initializes client', async t => {
  const { result } = renderHook(() => useBrowserAutomation());

  await waitFor(() => {
    t.is(result.current.loading, false);
    t.is(result.current.error, null);
  });
});
```

### Run Tests

```bash
# Run all tests
npm test

# Run specific test file
npm test tests/mcp/client/mcp-client.spec.ts

# Run with coverage
npx c8 ava
```

## Configuration

### Environment Variables

Create `.env` file in project root:

```env
# MCP Server Configuration
MCP_SERVER_COMMAND=npx
MCP_BROWSER=chrome
MCP_HEADLESS=true
MCP_TIMEOUT=30000
```

### Configuration File

**File**: `source/mcp/client/config.ts`

```typescript
export interface MCPConfig {
  serverCommand: string;
  serverArgs: string[];
  browser: 'chrome' | 'firefox' | 'webkit' | 'msedge';
  headless: boolean;
  timeout: number;
}

export const defaultConfig: MCPConfig = {
  serverCommand: 'npx',
  serverArgs: ['@playwright/mcp@latest'],
  browser: 'chrome',
  headless: true,
  timeout: 30000
};

export function getMCPConfig(): MCPConfig {
  return {
    serverCommand: process.env.MCP_SERVER_COMMAND || defaultConfig.serverCommand,
    browser: (process.env.MCP_BROWSER as MCPConfig['browser']) || defaultConfig.browser,
    headless: process.env.MCP_HEADLESS !== 'false',
    timeout: parseInt(process.env.MCP_TIMEOUT || '30000', 10),
    serverArgs: [
      ...defaultConfig.serverArgs,
      '--browser',
      process.env.MCP_BROWSER || defaultConfig.browser,
      ...(process.env.MCP_HEADLESS === 'false' ? [] : ['--headless'])
    ]
  };
}
```

## Common Operations

### Navigate to URL

```typescript
const { navigate } = useBrowserAutomation();

await navigate('https://example.com');
```

### Capture Screenshot

```typescript
const { screenshot } = useBrowserAutomation();

const base64Image = await screenshot();
// Save to file or process for analysis
```

### Get Page Snapshot (Accessibility Tree)

```typescript
// Add to PlaywrightClient
async getSnapshot(): Promise<string> {
  const result = await this.mcpClient.callTool('browser_snapshot', {});
  return result.snapshot;
}

// Use in hook
const { getSnapshot } = useBrowserAutomation();
const snapshot = await getSnapshot();
```

### Execute JavaScript

```typescript
// Add to PlaywrightClient
async evaluate(script: string): Promise<unknown> {
  return this.mcpClient.callTool('browser_evaluate', { script });
}

// Use in hook
const { evaluate } = useBrowserAutomation();
const pageTitle = await evaluate('document.title');
```

## Troubleshooting

### Server Won't Start

**Problem**: `MCPClient` fails to connect

**Solution**:
```bash
# Verify server can run standalone
npx @playwright/mcp@latest --help

# Check Node.js version
node --version  # Should be >= 18.18.0

# Clear npm cache
npm cache clean --force
```

### Timeout Errors

**Problem**: Tool invocations time out

**Solution**:
```typescript
// Increase timeout in config
export const defaultConfig: MCPConfig = {
  // ...
  timeout: 60000  // 60 seconds
};
```

### Memory Leaks

**Problem**: Memory usage grows over time

**Solution**:
```typescript
// Ensure cleanup in useEffect
useEffect(() => {
  // ...initialization

  return () => {
    if (mcpClient) {
      mcpClient.close().catch(console.error);
    }
  };
}, []);
```

## Code Quality Checklist

Before committing, ensure:

```bash
# 1. TypeScript compiles
npm run compile

# 2. Code is formatted
npm run format

# 3. Linting passes
npm run lint

# 4. Tests pass
npm test

# 5. Coverage meets threshold
npx c8 ava
# Should show >= 80% coverage
```

## AI-Powered UX Analysis

### Step 5: Create MCP-to-AI Bridge (Domain Logic)

**File**: `source/mcp/client/ai-bridge.ts`

```typescript
import { tool } from 'ai';
import { z } from 'zod';
import { MCPClient } from './mcp-client.js';

export interface MCPToolDefinition {
  name: string;
  description: string;
  inputSchema: z.ZodObject<any>;
}

export function createAIToolFromMCP(
  mcpClient: MCPClient,
  toolDef: MCPToolDefinition
) {
  return tool({
    description: toolDef.description,
    inputSchema: toolDef.inputSchema,
    execute: async (input) => {
      const result = await mcpClient.callTool(toolDef.name, input);
      return result;
    }
  });
}

// Playwright-specific tool definitions
export const playwrightTools = {
  navigate: {
    name: 'browser_navigate',
    description: 'Navigate to a web page URL',
    inputSchema: z.object({
      url: z.string().url().describe('The URL to navigate to')
    })
  },
  snapshot: {
    name: 'browser_snapshot',
    description: 'Get accessibility tree structure of the current page',
    inputSchema: z.object({})
  },
  screenshot: {
    name: 'browser_take_screenshot',
    description: 'Capture visual screenshot of the current page',
    inputSchema: z.object({
      fullPage: z.boolean().optional().describe('Capture full scrollable page')
    })
  }
};
```

### Step 6: Create UX Analyzer (Domain Logic)

**File**: `source/models/ux-analyzer.ts`

```typescript
import { streamText } from 'ai';
import { openai } from '@ai-sdk/openai';
import { MCPClient } from '../mcp/client/mcp-client.js';
import { createAIToolFromMCP, playwrightTools } from '../mcp/client/ai-bridge.js';

export interface UXAnalysisConfig {
  url: string;
  personas: Array<{
    name: string;
    description: string;
    goals: string[];
  }>;
  focusAreas?: string[];
}

export async function analyzeUX(
  config: UXAnalysisConfig,
  mcpClient: MCPClient
) {
  // Create AI tools from MCP tools
  const tools = {
    navigateToPage: createAIToolFromMCP(mcpClient, playwrightTools.navigate),
    getPageStructure: createAIToolFromMCP(mcpClient, playwrightTools.snapshot),
    captureScreenshot: createAIToolFromMCP(mcpClient, playwrightTools.screenshot)
  };

  // Build persona context
  const personaContext = config.personas
    .map(p => `- ${p.name}: ${p.description}. Goals: ${p.goals.join(', ')}`)
    .join('\n');

  // Stream UX analysis with tool calling
  const result = streamText({
    model: openai('gpt-4o'),
    messages: [
      {
        role: 'system',
        content: `You are a UX expert. Analyze pages from these personas:\n\n${personaContext}`
      },
      {
        role: 'user',
        content: `Analyze the UX of ${config.url}`
      }
    ],
    tools,
    maxSteps: 10 // Allow multi-step analysis
  });

  return result;
}
```

### Step 7: Create UX Analysis Hook (Integration Layer)

**File**: `source/hooks/use-ux-analysis.ts`

```typescript
import { useState } from 'react';
import { analyzeUX, UXAnalysisConfig } from '../models/ux-analyzer.js';
import { useMCPClient } from './use-mcp-client.js';

export interface ToolCall {
  id: string;
  name: string;
  status: 'executing' | 'complete' | 'error';
}

export function useUXAnalysis() {
  const [status, setStatus] = useState<'idle' | 'analyzing' | 'complete'>('idle');
  const [toolCalls, setToolCalls] = useState<ToolCall[]>([]);
  const [analysisText, setAnalysisText] = useState<string>('');
  const [error, setError] = useState<Error | null>(null);

  const { client } = useMCPClient({
    serverCommand: 'npx',
    serverArgs: ['@playwright/mcp@latest', '--headless'],
    autoConnect: true
  });

  const startAnalysis = async (config: UXAnalysisConfig) => {
    if (!client) throw new Error('MCP client not connected');

    setStatus('analyzing');
    setToolCalls([]);
    setAnalysisText('');

    try {
      const result = await analyzeUX(config, client);

      // Stream results
      for await (const part of result.fullStream) {
        switch (part.type) {
          case 'tool-call':
            setToolCalls(prev => [
              ...prev,
              { id: part.toolCallId, name: part.toolName, status: 'executing' }
            ]);
            break;

          case 'tool-result':
            setToolCalls(prev =>
              prev.map(tc =>
                tc.id === part.toolCallId ? { ...tc, status: 'complete' } : tc
              )
            );
            break;

          case 'text-delta':
            setAnalysisText(prev => prev + part.textDelta);
            break;

          case 'finish':
            setStatus('complete');
            break;
        }
      }
    } catch (err) {
      setError(err as Error);
    }
  };

  return { status, toolCalls, analysisText, error, startAnalysis };
}
```

### Step 8: Use in Component with Streaming UI

**File**: `source/components/ux-analysis-app.tsx`

```typescript
import React from 'react';
import { Box, Text, Newline } from 'ink';
import Spinner from 'ink-spinner';
import { useUXAnalysis } from '../hooks/use-ux-analysis.js';

interface Props {
  url: string;
  personas: Array<{ name: string; description: string; goals: string[] }>;
}

export const UXAnalysisApp = ({ url, personas }: Props) => {
  const { status, toolCalls, analysisText, error, startAnalysis } = useUXAnalysis();

  React.useEffect(() => {
    startAnalysis({ url, personas });
  }, [url, personas]);

  return (
    <Box flexDirection="column" padding={1}>
      <Text bold color="cyan">🎨 uxlint - UX Analysis</Text>
      <Text dimColor>URL: {url}</Text>
      <Newline />

      {/* Status */}
      <Box>
        <Text bold>Status: </Text>
        {status === 'analyzing' && (
          <>
            <Text color="cyan"><Spinner type="dots" /></Text>
            <Text> Analyzing...</Text>
          </>
        )}
        {status === 'complete' && <Text color="green">✓ Complete</Text>}
        {error && <Text color="red">✗ Error: {error.message}</Text>}
      </Box>

      {/* Tool calls */}
      {toolCalls.length > 0 && (
        <Box marginTop={1} flexDirection="column">
          <Text bold>Browser Actions:</Text>
          {toolCalls.map(tc => (
            <Text key={tc.id} dimColor>
              {tc.status === 'complete' ? '✓' : '⋯'} {tc.name}
            </Text>
          ))}
        </Box>
      )}

      {/* Analysis output */}
      {analysisText && (
        <Box marginTop={1} flexDirection="column" borderStyle="single" padding={1}>
          <Text bold>Analysis Results:</Text>
          <Newline />
          <Text>{analysisText}</Text>
        </Box>
      )}
    </Box>
  );
};
```

## Advanced Configuration

### AI Provider Selection

**File**: `source/config/ai-providers.ts`

```typescript
import { openai } from '@ai-sdk/openai';
import { anthropic } from '@ai-sdk/anthropic';

export type AIProvider = 'openai' | 'anthropic';

export function getAIModel(provider: AIProvider, model?: string) {
  switch (provider) {
    case 'openai':
      return openai(model || 'gpt-4o');
    case 'anthropic':
      return anthropic(model || 'claude-3-5-sonnet-20241022');
    default:
      throw new Error(`Unknown provider: ${provider}`);
  }
}
```

### Environment Variables

Update `.env`:

```env
# MCP Configuration
MCP_SERVER_COMMAND=npx
MCP_BROWSER=chrome
MCP_HEADLESS=true
MCP_TIMEOUT=30000

# AI Configuration
OPENAI_API_KEY=your-api-key-here
ANTHROPIC_API_KEY=your-api-key-here
AI_PROVIDER=openai
AI_MODEL=gpt-4o
```

## Next Steps

1. **Test AI Integration**:
   - Create test fixtures for personas
   - Mock AI responses for unit tests
   - Test streaming UI updates

2. **Add Prompt Templates**:
   - Create reusable UX analysis prompts
   - Template for different analysis types
   - Persona-specific prompts

3. **Enhance Error Handling**:
   - Retry logic for AI API failures
   - Graceful degradation on timeout
   - User-friendly error messages

4. **Performance Optimization**:
   - Monitor AI token usage
   - Optimize prompt length
   - Cache repeated analyses

## Reference Documentation

- [MCP Specification](https://modelcontextprotocol.io/specification/latest)
- [TypeScript SDK](https://github.com/modelcontextprotocol/typescript-sdk)
- [Playwright MCP Server](https://github.com/microsoft/playwright-mcp)
- [Full Research Doc](./research.md)
- [Data Model Doc](./data-model.md)
- [API Contracts](./contracts/mcp-client.ts)

## Examples Repository

See `specs/001-uxlint-config-interactive/research.md` for:
- Complete implementation examples
- Advanced patterns (error handling, timeouts, retries)
- Testing strategies
- Performance optimization techniques

## Getting Help

1. Check [research.md](./research.md) for detailed implementation guidance
2. Review [data-model.md](./data-model.md) for entity relationships
3. Consult [contracts/mcp-client.ts](./contracts/mcp-client.ts) for API reference
4. Search [MCP GitHub Discussions](https://github.com/modelcontextprotocol/typescript-sdk/discussions)

## Summary

You've successfully set up Playwright MCP integration! The key components are:

1. **MCPClient** - Core protocol implementation
2. **PlaywrightClient** - Browser automation wrapper
3. **useBrowserAutomation** - React hook for UI integration
4. **Tests** - Unit tests for models, visual tests for components

Now you're ready to implement browser automation features in uxlint!
