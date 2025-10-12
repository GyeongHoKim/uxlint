/**
 * Error hierarchy for MCP operations
 * @packageDocumentation
 */

/**
 * Base error class for all MCP-related errors
 *
 * All MCP errors extend this class and include an error code for programmatic handling.
 *
 * @example
 * ```typescript
 * try {
 *   await client.connect('npx', ['@playwright/mcp@latest']);
 * } catch (error) {
 *   if (error instanceof McpError) {
 *     console.error(`MCP Error [${error.code}]: ${error.message}`);
 *   }
 * }
 * ```
 */
export class McpError extends Error {
	public readonly code: string;

	/**
	 * Create a new MCP error
	 *
	 * @param message - Human-readable error message
	 * @param code - Machine-readable error code
	 */
	constructor(message: string, code: string) {
		super(message);
		this.code = code;
		this.name = 'McpError';
		// Maintain proper stack trace for where our error was thrown (only available on V8)
		if (Error.captureStackTrace) {
			Error.captureStackTrace(this, McpError);
		}
	}
}

/**
 * Error thrown when server connection fails
 *
 * This error occurs when the MCP server cannot be started or connected to,
 * typically due to missing executable, permission issues, or network problems.
 *
 * @example
 * ```typescript
 * try {
 *   await client.connect('invalid-command', []);
 * } catch (error) {
 *   if (error instanceof ConnectionError) {
 *     console.error(`Failed to connect to ${error.serverCommand}`);
 *   }
 * }
 * ```
 */
export class ConnectionError extends McpError {
	public readonly serverCommand?: string;

	/**
	 * Create a new connection error
	 *
	 * @param message - Human-readable error message
	 * @param serverCommand - Server command that failed (optional)
	 */
	constructor(message: string, serverCommand?: string) {
		super(message, 'CONNECTION_ERROR');
		this.serverCommand = serverCommand;
		this.name = 'ConnectionError';
		if (Error.captureStackTrace) {
			Error.captureStackTrace(this, ConnectionError);
		}
	}
}

/**
 * Error thrown when tool invocation fails
 *
 * This error occurs when a tool call to the MCP server fails,
 * either due to invalid arguments, tool errors, or server issues.
 *
 * @example
 * ```typescript
 * try {
 *   await playwrightClient.navigate('invalid-url');
 * } catch (error) {
 *   if (error instanceof ToolInvocationError) {
 *     console.error(`Tool ${error.toolName} failed with args:`, error.toolArgs);
 *   }
 * }
 * ```
 */
export class ToolInvocationError extends McpError {
	/**
	 * Create a new tool invocation error
	 *
	 * @param message - Human-readable error message
	 * @param toolName - Name of the tool that failed
	 * @param toolArgs - Arguments passed to the tool (optional)
	 */
	constructor(
		message: string,
		public readonly toolName: string,
		public readonly toolArgs?: Record<string, unknown>,
	) {
		super(message, 'TOOL_INVOCATION_ERROR');
		this.name = 'ToolInvocationError';
		if (Error.captureStackTrace) {
			Error.captureStackTrace(this, ToolInvocationError);
		}
	}
}

/**
 * Error thrown when server is not available
 *
 * This error occurs when the server is unreachable or not responding,
 * typically during capability discovery or tool listing operations.
 *
 * @example
 * ```typescript
 * try {
 *   const tools = await client.listTools();
 * } catch (error) {
 *   if (error instanceof ServerNotAvailableError) {
 *     console.error('Server is not responding');
 *   }
 * }
 * ```
 */
export class ServerNotAvailableError extends McpError {
	/**
	 * Create a new server not available error
	 *
	 * @param message - Human-readable error message
	 */
	constructor(message: string) {
		super(message, 'SERVER_NOT_AVAILABLE');
		this.name = 'ServerNotAvailableError';
		if (Error.captureStackTrace) {
			Error.captureStackTrace(this, ServerNotAvailableError);
		}
	}
}

/**
 * Error thrown when tool invocation exceeds timeout
 *
 * This error occurs when a tool call takes longer than the specified timeout,
 * indicating the operation may be hanging or the timeout is too short.
 *
 * @example
 * ```typescript
 * try {
 *   await playwrightClient.navigate('https://slow-site.com', 1000);
 * } catch (error) {
 *   if (error instanceof TimeoutError) {
 *     console.error(`${error.toolName} timed out after ${error.timeout}ms`);
 *   }
 * }
 * ```
 */
export class TimeoutError extends McpError {
	/**
	 * Create a new timeout error
	 *
	 * @param message - Human-readable error message
	 * @param toolName - Name of the tool that timed out
	 * @param timeout - Timeout value in milliseconds
	 */
	constructor(
		message: string,
		public readonly toolName: string,
		public readonly timeout: number,
	) {
		super(message, 'TIMEOUT_ERROR');
		this.name = 'TimeoutError';
		if (Error.captureStackTrace) {
			Error.captureStackTrace(this, TimeoutError);
		}
	}
}
