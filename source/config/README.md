# MCP Client Configuration

This document explains how to configure the MCP (Model Context Protocol) client for browser automation in uxlint.

## Overview

The MCP client configuration controls how uxlint connects to and communicates with the Playwright MCP server for browser automation tasks. Configuration can be provided through environment variables, programmatic API calls, or using sensible defaults.

## Configuration Options

### McpConfig Type

```typescript
type McpConfig = {
	serverCommand: string; // Server executable command (e.g., 'npx')
	serverArgs: string[]; // Server launch arguments
	browser: BrowserType; // Browser type to use
	headless: boolean; // Run browser in headless mode
	timeout: number; // Tool invocation timeout in milliseconds
};
```

### Browser Types

Supported browser types:

- `'chrome'` - Google Chrome/Chromium (default)
- `'firefox'` - Mozilla Firefox
- `'webkit'` - Apple Safari (WebKit)
- `'msedge'` - Microsoft Edge

## Configuration Methods

### 1. Using Defaults

The simplest approach is to use the default configuration:

```typescript
import {getDefaultMcpConfig} from './mcp/client/config.js';

const config = getDefaultMcpConfig();
// Returns:
// {
//   serverCommand: 'npx',
//   serverArgs: ['@playwright/mcp@latest'],
//   browser: 'chrome',
//   headless: true,
//   timeout: 30000
// }
```

### 2. Environment Variables

Configure via environment variables:

```bash
export MCP_SERVER_COMMAND=npx
export MCP_BROWSER=firefox
export MCP_HEADLESS=false
export MCP_TIMEOUT=60000
```

Then in your code:

```typescript
import {getMcpConfigFromEnv} from './mcp/client/config.js';

const config = getMcpConfigFromEnv();
// Reads from environment variables and merges with defaults
```

#### Environment Variable Reference

| Variable             | Description                    | Default    | Valid Values                                    |
| -------------------- | ------------------------------ | ---------- | ----------------------------------------------- |
| `MCP_SERVER_COMMAND` | Command to launch MCP server   | `'npx'`    | Any executable command                          |
| `MCP_BROWSER`        | Browser type to use            | `'chrome'` | `'chrome'`, `'firefox'`, `'webkit'`, `'msedge'` |
| `MCP_HEADLESS`       | Run browser in headless mode   | `true`     | `'true'`, `'false'`                             |
| `MCP_TIMEOUT`        | Default operation timeout (ms) | `30000`    | `1000`-`300000`                                 |

### 3. Partial Configuration

Provide only the values you want to override:

```typescript
import {mergeMcpConfig} from './mcp/client/config.js';

const config = mergeMcpConfig({
	browser: 'firefox',
	timeout: 60000,
	// Other values use defaults
});
// Returns:
// {
//   serverCommand: 'npx',
//   serverArgs: ['@playwright/mcp@latest'],
//   browser: 'firefox',
//   headless: true,
//   timeout: 60000
// }
```

### 4. Direct Client Configuration

Pass configuration directly when connecting:

```typescript
import {McpClient} from './mcp/client/mcp-client.js';

const client = new McpClient('my-app', '1.0.0');
await client.connect('npx', [
	'@playwright/mcp@latest',
	'--headless',
	'--browser',
	'firefox',
]);
```

## Usage Examples

### Example 1: Basic Connection with Defaults

```typescript
import {McpClient} from './mcp/client/mcp-client.js';
import {PlaywrightClient} from './mcp/client/playwright-client.js';

// Create MCP client
const mcpClient = new McpClient('uxlint', '1.0.0');

// Connect using defaults
await mcpClient.connect('npx', ['@playwright/mcp@latest', '--headless']);

// Create Playwright client wrapper
const playwrightClient = new PlaywrightClient(mcpClient);

// Use browser automation
await playwrightClient.navigate('https://example.com');
const screenshot = await playwrightClient.screenshot();

// Cleanup
await mcpClient.close();
```

### Example 2: Custom Browser Configuration

```typescript
import {McpClient} from './mcp/client/mcp-client.js';
import {mergeMcpConfig} from './mcp/client/config.js';

const config = mergeMcpConfig({
	browser: 'firefox',
	headless: false, // Show browser window
	timeout: 60000, // 1 minute timeout
});

const client = new McpClient('uxlint', '1.0.0');
await client.connect(config.serverCommand, [
	...config.serverArgs,
	'--browser',
	config.browser,
	...(config.headless ? ['--headless'] : []),
]);
```

### Example 3: Environment-Based Configuration

```bash
# .env file
MCP_BROWSER=webkit
MCP_HEADLESS=false
MCP_TIMEOUT=45000
```

```typescript
import {getMcpConfigFromEnv} from './mcp/client/config.js';
import {McpClient} from './mcp/client/mcp-client.js';

const config = getMcpConfigFromEnv();
const client = new McpClient('uxlint', '1.0.0');
await client.connect(config.serverCommand, config.serverArgs);
```

### Example 4: React Hook with Configuration

```typescript
import {useMcpClient} from './hooks/use-mcp-client.js';
import {useBrowserAutomation} from './hooks/use-browser-automation.js';

function MyComponent() {
	const {navigate, screenshot, loading, error} = useBrowserAutomation({
		serverCommand: 'npx',
		serverArgs: [
			'@playwright/mcp@latest',
			'--headless',
			'--browser',
			'firefox',
		],
		autoConnect: true,
	});

	// Use browser automation
	if (loading) return 'Connecting...';
	if (error) return `Error: ${error.message}`;

	// Navigate and capture screenshot
	await navigate('https://example.com');
	const result = await screenshot();
}
```

## Timeout Configuration

### Operation-Specific Timeouts

Each browser operation accepts an optional timeout parameter:

```typescript
// Use custom timeout for slow-loading pages
await playwrightClient.navigate('https://slow-site.com', 60000); // 60 seconds

// Use custom timeout for screenshot
await playwrightClient.screenshot(5000); // 5 seconds

// Use custom timeout for snapshot
await playwrightClient.getSnapshot(3000); // 3 seconds

// Use custom timeout for evaluation
await playwrightClient.evaluate('document.title', 2000); // 2 seconds
```

### Valid Timeout Range

- **Minimum**: 1000ms (1 second)
- **Maximum**: 300000ms (5 minutes)
- **Default**: 30000ms (30 seconds)

Timeouts outside this range will be rejected with a validation error.

## Performance Targets

Based on success criteria (see `specs/001-uxlint-config-interactive/spec.md`):

- **SC-001**: Session initialization < 5s
- **SC-002**: Capability discovery < 2s
- **SC-003**: Page navigation < 10s
- **SC-004**: Screenshot capture < 3s
- **SC-005**: Snapshot extraction < 2s
- **SC-006**: Evaluate operation < 5s

Configure timeouts to balance between operation success and these performance targets.

## Error Handling

### Connection Errors

```typescript
import {ConnectionError} from './mcp/client/errors.js';

try {
	await client.connect('invalid-command', []);
} catch (error) {
	if (error instanceof ConnectionError) {
		console.error(`Connection failed: ${error.message}`);
		console.error(`Server command: ${error.serverCommand}`);
	}
}
```

### Timeout Errors

```typescript
import {TimeoutError} from './mcp/client/errors.js';

try {
	await playwrightClient.navigate('https://slow-site.com', 1000);
} catch (error) {
	if (error instanceof TimeoutError) {
		console.error(`${error.toolName} timed out after ${error.timeout}ms`);
		// Try again with longer timeout
		await playwrightClient.navigate('https://slow-site.com', 30000);
	}
}
```

## Best Practices

### 1. Use Default Configuration for Development

```typescript
const config = getDefaultMcpConfig();
```

This provides sensible defaults for most use cases.

### 2. Use Environment Variables for Production

```bash
export MCP_BROWSER=chrome
export MCP_HEADLESS=true
export MCP_TIMEOUT=30000
```

This allows configuration changes without code modifications.

### 3. Always Handle Connection Errors

```typescript
try {
	await client.connect(command, args);
} catch (error) {
	// Log error and provide fallback
	console.error('Failed to connect:', error);
	// Implement retry logic or graceful degradation
}
```

### 4. Set Appropriate Timeouts

```typescript
// Short timeout for fast operations
const title = await playwrightClient.evaluate('document.title', 2000);

// Longer timeout for slow-loading pages
await playwrightClient.navigate('https://slow-site.com', 60000);
```

### 5. Clean Up Resources

```typescript
try {
	// Perform operations
	await playwrightClient.navigate('https://example.com');
} finally {
	// Always clean up
	await mcpClient.close();
}
```

### 6. Use Headless Mode in CI/CD

```bash
# .github/workflows/test.yml
env:
  MCP_HEADLESS: true
  MCP_BROWSER: chrome
```

Headless mode is faster and uses fewer resources in automated environments.

## Troubleshooting

### Server Not Found

```
Error: Failed to start MCP server: command 'npx' not found
```

**Solution**: Install Node.js and npm, or specify full path to npx:

```typescript
await client.connect('/usr/local/bin/npx', ['@playwright/mcp@latest']);
```

### Permission Denied

```
Error: Failed to start MCP server: permission denied for 'npx'
```

**Solution**: Check file permissions or use a different executable:

```bash
chmod +x /usr/local/bin/npx
```

### Timeout Errors

```
Error: Tool 'browser_navigate' timed out after 30000ms
```

**Solutions**:

1. Increase timeout for slow operations
2. Check network connectivity
3. Verify target URL is accessible
4. Use headless mode for better performance

### Browser Not Installed

```
Error: Browser 'firefox' is not installed
```

**Solution**: Install Playwright browsers:

```bash
npx playwright install firefox
```

## API Reference

See JSDoc comments in source files for detailed API documentation:

- `source/mcp/client/config.ts` - Configuration helpers
- `source/mcp/client/types.ts` - Type definitions
- `source/mcp/client/mcp-client.ts` - Core MCP client
- `source/mcp/client/playwright-client.ts` - Browser automation client
- `source/mcp/client/errors.ts` - Error types
- `source/mcp/client/validators.ts` - Validation utilities

## Further Reading

- [Model Context Protocol Specification](https://modelcontextprotocol.io/)
- [Playwright MCP Server Documentation](https://github.com/microsoft/playwright/tree/main/utils/mcp)
- [MCP TypeScript SDK](https://github.com/modelcontextprotocol/typescript-sdk)
