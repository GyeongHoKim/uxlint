/**
 * TypeScript Contract for MCP Client API
 *
 * This file defines the public interfaces for the MCP client implementation.
 * These contracts serve as the API boundary between domain logic and consumers.
 *
 * @packageDocumentation
 */

// ============================================================================
// Core Client Interfaces
// ============================================================================

/**
 * MCP client for connecting to and communicating with MCP servers
 */
export interface IMCPClient {
	/**
	 * Connect to an MCP server
	 *
	 * @param serverCommand - Command to launch the server (e.g., 'npx')
	 * @param serverArgs - Arguments for the server command
	 * @throws {ConnectionError} If connection fails
	 * @throws {ServerNotAvailableError} If server cannot be reached
	 */
	connect(serverCommand: string, serverArgs: string[]): Promise<void>;

	/**
	 * List all tools available on the connected server
	 *
	 * @returns Array of available tools with their schemas
	 * @throws {MCPError} If client is not connected
	 */
	listTools(): Promise<Tool[]>;

	/**
	 * Invoke a tool on the server
	 *
	 * @param name - Tool name to invoke
	 * @param args - Tool parameters
	 * @returns Tool result
	 * @throws {ToolInvocationError} If tool execution fails
	 * @throws {TimeoutError} If tool execution exceeds timeout
	 * @throws {MCPError} If client is not connected
	 */
	callTool<T = unknown>(name: string, args: Record<string, unknown>): Promise<T>;

	/**
	 * Close the connection to the server
	 */
	close(): Promise<void>;

	/**
	 * Check if the client is currently connected
	 */
	isConnected(): boolean;
}

/**
 * Playwright-specific MCP client providing typed tool wrappers
 */
export interface IPlaywrightClient {
	/**
	 * Navigate browser to a URL
	 *
	 * @param url - Target URL to navigate to
	 * @returns Navigation result with final URL and status
	 * @throws {ToolInvocationError} If navigation fails
	 */
	navigate(url: string): Promise<NavigateResult>;

	/**
	 * Capture a screenshot of the current page
	 *
	 * @returns Screenshot result with base64-encoded image
	 * @throws {ToolInvocationError} If screenshot capture fails
	 */
	screenshot(): Promise<ScreenshotResult>;

	/**
	 * Get accessibility tree snapshot of the current page
	 *
	 * @returns Snapshot result with accessibility tree JSON
	 * @throws {ToolInvocationError} If snapshot capture fails
	 */
	getSnapshot(): Promise<SnapshotResult>;

	/**
	 * Click an element on the page
	 *
	 * @param selector - CSS selector for the element to click
	 * @throws {ToolInvocationError} If click fails or selector invalid
	 */
	click(selector: string): Promise<void>;

	/**
	 * Fill form fields on the page
	 *
	 * @param fields - Map of field selectors to values
	 * @throws {ToolInvocationError} If form filling fails
	 */
	fillForm(fields: Record<string, string>): Promise<void>;

	/**
	 * Execute JavaScript in the page context
	 *
	 * @param script - JavaScript code to execute
	 * @returns Result of the script execution
	 * @throws {ToolInvocationError} If script execution fails
	 */
	evaluate(script: string): Promise<unknown>;

	/**
	 * Close the browser page
	 */
	close(): Promise<void>;
}

// ============================================================================
// Data Transfer Objects
// ============================================================================

/**
 * MCP tool definition
 */
export interface Tool {
	/** Unique tool identifier (kebab-case) */
	name: string;

	/** Human-readable description of the tool */
	description?: string;

	/** JSON Schema defining tool input parameters */
	inputSchema: Record<string, unknown>;

	/** JSON Schema defining tool output format */
	outputSchema?: Record<string, unknown>;
}

/**
 * Result of a page navigation operation
 */
export interface NavigateResult {
	/** Whether navigation succeeded */
	success: boolean;

	/** Final URL after any redirects */
	url: string;

	/** Page title if available */
	title?: string;

	/** HTTP status code if available */
	status?: number;
}

/**
 * Result of a screenshot capture operation
 */
export interface ScreenshotResult {
	/** Base64-encoded image data */
	screenshot: string;

	/** Image width in pixels */
	width: number;

	/** Image height in pixels */
	height: number;

	/** Image format */
	format?: 'png' | 'jpeg';
}

/**
 * Result of an accessibility tree snapshot operation
 */
export interface SnapshotResult {
	/** Accessibility tree as JSON string */
	snapshot: string;

	/** Timestamp of capture in milliseconds */
	timestamp?: number;
}

/**
 * Configuration for MCP client behavior
 */
export interface MCPConfig {
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
}

/**
 * Supported browser types
 */
export type BrowserType = 'chrome' | 'firefox' | 'webkit' | 'msedge';

// ============================================================================
// Error Types
// ============================================================================

/**
 * Base error class for all MCP-related errors
 */
export interface IMCPError extends Error {
	/** Error code for programmatic handling */
	code: string;
}

/**
 * Error thrown when server connection fails
 */
export interface IConnectionError extends IMCPError {
	code: 'CONNECTION_ERROR';

	/** The server command that failed */
	serverCommand?: string;
}

/**
 * Error thrown when tool invocation fails
 */
export interface IToolInvocationError extends IMCPError {
	code: 'TOOL_INVOCATION_ERROR';

	/** Name of the tool that failed */
	toolName: string;

	/** Arguments passed to the tool */
	toolArgs?: Record<string, unknown>;
}

/**
 * Error thrown when server is not available
 */
export interface IServerNotAvailableError extends IMCPError {
	code: 'SERVER_NOT_AVAILABLE';
}

/**
 * Error thrown when tool invocation exceeds timeout
 */
export interface ITimeoutError extends IMCPError {
	code: 'TIMEOUT_ERROR';

	/** Name of the tool that timed out */
	toolName: string;

	/** Timeout value in milliseconds */
	timeout: number;
}

// ============================================================================
// Transport Configuration
// ============================================================================

/**
 * Configuration for stdio transport
 */
export interface StdioTransportConfig {
	/** Executable command to launch */
	command: string;

	/** Command-line arguments */
	args: string[];

	/** Environment variables to set */
	env?: Record<string, string>;

	/** Working directory for the process */
	cwd?: string;
}

/**
 * Tool invocation request
 */
export interface ToolInvocation {
	/** Tool name to invoke */
	name: string;

	/** Tool parameters as key-value pairs */
	arguments: Record<string, unknown>;

	/** Optional timeout override in milliseconds */
	timeout?: number;
}

/**
 * Tool invocation result
 */
export interface ToolResult<T = unknown> {
	/** Result content */
	content: Content[];

	/** Indicates if the result is an error */
	isError?: boolean;

	/** Structured result data */
	data?: T;
}

/**
 * Content item in a tool result
 */
export interface Content {
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
}

// ============================================================================
// React Hook Interfaces
// ============================================================================

/**
 * Return type for useMCPClient hook
 */
export interface UseMCPClientReturn {
	/** MCP client instance (null if not connected) */
	client: IMCPClient | null;

	/** Current connection state */
	connected: boolean;

	/** Connection or operation error */
	error: Error | null;

	/** Connect to the MCP server */
	connect: () => Promise<void>;

	/** Disconnect from the MCP server */
	disconnect: () => Promise<void>;
}

/**
 * Options for useMCPClient hook
 */
export interface UseMCPClientOptions {
	/** Server command to execute */
	serverCommand: string;

	/** Server command arguments */
	serverArgs: string[];

	/** Automatically connect on mount */
	autoConnect?: boolean;
}

/**
 * Return type for useBrowserAutomation hook
 */
export interface UseBrowserAutomationReturn {
	/** Navigate to a URL */
	navigate: (url: string) => Promise<void>;

	/** Capture a screenshot */
	screenshot: () => Promise<string>;

	/** Get accessibility tree snapshot */
	getSnapshot: () => Promise<string>;

	/** Current operation loading state */
	loading: boolean;

	/** Operation error */
	error: Error | null;
}

// ============================================================================
// Validation Functions
// ============================================================================

/**
 * Validates a URL string
 *
 * @param url - URL to validate
 * @returns True if valid, false otherwise
 */
export function isValidUrl(url: string): boolean;

/**
 * Validates a CSS selector
 *
 * @param selector - CSS selector to validate
 * @returns True if valid, false otherwise
 */
export function isValidSelector(selector: string): boolean;

/**
 * Validates JavaScript code for safety
 *
 * @param script - JavaScript code to validate
 * @returns True if safe, false otherwise
 */
export function isScriptSafe(script: string): boolean;

/**
 * Validates a timeout value
 *
 * @param timeout - Timeout in milliseconds
 * @returns True if valid, false otherwise
 */
export function isValidTimeout(timeout: number): boolean;

// ============================================================================
// Configuration Helpers
// ============================================================================

/**
 * Get default MCP configuration
 *
 * @returns Default configuration object
 */
export function getDefaultMCPConfig(): MCPConfig;

/**
 * Get MCP configuration from environment variables
 *
 * @returns Configuration with environment overrides
 */
export function getMCPConfigFromEnv(): MCPConfig;

/**
 * Merge partial configuration with defaults
 *
 * @param partial - Partial configuration to merge
 * @returns Complete configuration
 */
export function mergeMCPConfig(partial: Partial<MCPConfig>): MCPConfig;
