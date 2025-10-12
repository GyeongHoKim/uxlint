/**
 * Type definitions for MCP client
 * @packageDocumentation
 */

/**
 * MCP tool definition
 */
export type Tool = {
	/** Unique tool identifier (kebab-case) */
	name: string;

	/** Human-readable description of the tool */
	description?: string;

	/** JSON Schema defining tool input parameters */
	inputSchema: Record<string, unknown>;

	/** JSON Schema defining tool output format */
	outputSchema?: Record<string, unknown>;
};

/**
 * Result of a page navigation operation
 */
export type NavigateResult = {
	/** Whether navigation succeeded */
	success: boolean;

	/** Final URL after any redirects */
	url: string;

	/** Page title if available */
	title?: string;

	/** HTTP status code if available */
	status?: number;
};

/**
 * Result of a screenshot capture operation
 */
export type ScreenshotResult = {
	/** Base64-encoded image data */
	screenshot: string;

	/** Image width in pixels */
	width: number;

	/** Image height in pixels */
	height: number;

	/** Image format */
	format?: 'png' | 'jpeg';
};

/**
 * Result of an accessibility tree snapshot operation
 */
export type SnapshotResult = {
	/** Accessibility tree as JSON string */
	snapshot: string;

	/** Timestamp of capture in milliseconds */
	timestamp?: number;
};

/**
 * Supported browser types
 */
export type BrowserType = 'chrome' | 'firefox' | 'webkit' | 'msedge';

/**
 * Configuration for MCP client behavior
 */
export type McpConfig = {
	/** Server executable command (e.g., 'npx') */
	serverCommand: string;

	/** Server launch arguments */
	serverArgs: string[];

	/** Browser type to use */
	browser: BrowserType;

	/** Run browser in headless mode */
	headless: boolean;

	/** Tool invocation timeout in milliseconds */
	timeout: number;
};

/**
 * Configuration for stdio transport
 */
export type StdioTransportConfig = {
	/** Executable command to launch */
	command: string;

	/** Command-line arguments */
	args: string[];

	/** Environment variables to set */
	env?: Record<string, string>;

	/** Working directory for the process */
	cwd?: string;
};

/**
 * Tool invocation request
 */
export type ToolInvocation = {
	/** Tool name to invoke */
	name: string;

	/** Tool parameters as key-value pairs */
	arguments: Record<string, unknown>;

	/** Optional timeout override in milliseconds */
	timeout?: number;
};

/**
 * Tool invocation result
 */
export type ToolResult<T = unknown> = {
	/** Result content */
	content: Content[];

	/** Indicates if the result is an error */
	isError?: boolean;

	/** Structured result data */
	data?: T;
};

/**
 * Content item in a tool result
 */
export type Content = {
	/** Content type */
	type: 'text' | 'resource' | 'image';

	/** Text content (for type='text') */
	text?: string;

	/** Base64-encoded data (for type='image') */
	data?: string;

	/** MIME type (for type='image') */
	mimeType?: string;

	/** Resource URI (for type='resource') */
	uri?: string;
};

/**
 * MCP tool call response from the SDK
 */
export type McpToolResponse = {
	/** Content array returned by the tool */
	content: Content[];

	/** Indicates if the result is an error */
	isError?: boolean;
};

/**
 * Options for useMCPClient hook
 */
export type UseMcpClientOptions = {
	/** Server command to execute */
	serverCommand: string;

	/** Server command arguments */
	serverArgs: string[];

	/** Automatically connect on mount */
	autoConnect?: boolean;
};

/**
 * Screenshot options
 */
export type ScreenshotOptions = {
	/** CSS selector for element to screenshot */
	element?: string;

	/** Capture full scrollable page */
	fullPage?: boolean;

	/** Image format (alias for format) */
	type?: 'png' | 'jpeg';

	/** Image format */
	format?: 'png' | 'jpeg';

	/** Timeout in milliseconds */
	timeout?: number;
};

/**
 * Snapshot options
 */
export type SnapshotOptions = {
	/** Focus on specific area (CSS selector) */
	focusArea?: string;

	/** Maximum depth of accessibility tree */
	maxDepth?: number;

	/** Timeout in milliseconds */
	timeout?: number;
};

/**
 * Navigate options
 */
export type NavigateOptions = {
	/** Wait until condition ('load', 'domcontentloaded', 'networkidle') */
	waitUntil?: 'load' | 'domcontentloaded' | 'networkidle';

	/** Timeout in milliseconds */
	timeout?: number;
};

/**
 * Evaluate options
 */
export type EvaluateOptions = {
	/** Timeout in milliseconds */
	timeout?: number;
};
