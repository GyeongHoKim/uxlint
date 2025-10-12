/**
 * Error hierarchy for MCP operations
 * @packageDocumentation
 */

/**
 * Base error class for all MCP-related errors
 */
export class McpError extends Error {
	public readonly code: string;

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
 */
export class ConnectionError extends McpError {
	public readonly serverCommand?: string;

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
 */
export class ToolInvocationError extends McpError {
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
 */
export class ServerNotAvailableError extends McpError {
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
 */
export class TimeoutError extends McpError {
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
