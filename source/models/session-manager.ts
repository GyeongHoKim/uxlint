/**
 * Session Manager for MCP client lifecycle and operation tracking
 * @packageDocumentation
 */

import type {Tool} from '../mcp/client/types.js';

/**
 * Session state enumeration
 */
export type SessionState =
	| 'initializing' // Session is being set up
	| 'ready' // Session is ready for operations
	| 'error' // Session encountered an error
	| 'closed'; // Session has been terminated

/**
 * Record of a tool invocation within a session
 */
export type OperationRecord = {
	/** Unique operation identifier */
	id: string;

	/** Tool name that was invoked */
	toolName: string;

	/** Timestamp when operation started */
	startTime: number;

	/** Timestamp when operation completed */
	endTime?: number;

	/** Operation duration in milliseconds */
	duration?: number;

	/** Operation status */
	status: 'pending' | 'success' | 'error';

	/** Error message if operation failed */
	error?: string;
};

/**
 * Health check result
 */
export type HealthCheckResult = {
	/** Overall health status */
	healthy: boolean;

	/** Connection status */
	connected: boolean;

	/** Number of successful operations */
	successfulOperations: number;

	/** Number of failed operations */
	failedOperations: number;

	/** Session uptime in milliseconds */
	uptime: number;

	/** Last health check timestamp */
	lastCheck: number;
};

/**
 * Session Manager for tracking MCP client lifecycle and operations
 *
 * @example
 * ```typescript
 * const manager = new SessionManager('my-session');
 *
 * // Initialize session
 * manager.initialize();
 *
 * // Track operations
 * const opId = manager.startOperation('browser_navigate');
 * // ... perform operation ...
 * manager.completeOperation(opId, 'success');
 *
 * // Check health
 * const health = manager.getHealth();
 * console.log(`Session healthy: ${health.healthy}`);
 *
 * // Close session
 * manager.close();
 * ```
 */
export class SessionManager {
	private readonly sessionId: string;
	private state: SessionState = 'closed';
	private readonly operations: OperationRecord[] = [];
	private startTime?: number;
	private reconnectAttempts = 0;
	private availableTools: Tool[] = [];

	/**
	 * Create a new session manager
	 *
	 * @param sessionId - Unique session identifier
	 */
	constructor(sessionId: string) {
		this.sessionId = sessionId;
	}

	/**
	 * Initialize the session
	 */
	initialize(): void {
		this.state = 'initializing';
		this.startTime = Date.now();
		this.operations.length = 0; // Clear operations
		this.reconnectAttempts = 0;
	}

	/**
	 * Mark session as ready
	 */
	ready(): void {
		if (this.state === 'initializing') {
			this.state = 'ready';
		}
	}

	/**
	 * Mark session as errored
	 */
	error(): void {
		this.state = 'error';
	}

	/**
	 * Close the session
	 */
	close(): void {
		// Complete any pending operations as errors
		for (const op of this.operations) {
			if (op.status === 'pending') {
				op.status = 'error';
				op.error = 'Session closed';
				op.endTime = Date.now();
				op.duration = op.endTime - op.startTime;
			}
		}

		this.state = 'closed';
	}

	/**
	 * Get current session state
	 */
	getState(): SessionState {
		return this.state;
	}

	/**
	 * Get session ID
	 */
	getSessionId(): string {
		return this.sessionId;
	}

	/**
	 * Start tracking a new operation
	 *
	 * @param toolName - Name of the tool being invoked
	 * @returns Operation ID for tracking
	 */
	startOperation(toolName: string): string {
		const operation: OperationRecord = {
			id: `${this.sessionId}-${Date.now()}-${Math.random()
				.toString(36)
				.slice(2, 9)}`,
			toolName,
			startTime: Date.now(),
			status: 'pending',
		};

		this.operations.push(operation);
		return operation.id;
	}

	/**
	 * Mark an operation as complete
	 *
	 * @param operationId - Operation ID returned from startOperation
	 * @param status - Final status of the operation
	 * @param error - Error message if operation failed
	 */
	completeOperation(
		operationId: string,
		status: 'success' | 'error',
		error?: string,
	): void {
		const operation = this.operations.find(op => op.id === operationId);

		if (operation && operation.status === 'pending') {
			operation.status = status;
			operation.endTime = Date.now();
			operation.duration = operation.endTime - operation.startTime;
			operation.error = error;
		}
	}

	/**
	 * Get all operations in this session
	 */
	getOperations(): readonly OperationRecord[] {
		return [...this.operations];
	}

	/**
	 * Get operation count by status
	 */
	getOperationCount(status?: 'pending' | 'success' | 'error'): number {
		if (!status) {
			return this.operations.length;
		}

		return this.operations.filter(op => op.status === status).length;
	}

	/**
	 * Check session health
	 *
	 * @param connected - Current connection status
	 * @returns Health check result
	 */
	getHealth(connected: boolean): HealthCheckResult {
		const now = Date.now();
		const successfulOperations = this.getOperationCount('success');
		const failedOperations = this.getOperationCount('error');
		const uptime = this.startTime ? now - this.startTime : 0;

		// Consider session healthy if:
		// 1. Connection is active
		// 2. State is ready
		// 3. No recent errors (last 5 operations)
		const recentOperations = this.operations.slice(-5);
		const recentFailures = recentOperations.filter(
			op => op.status === 'error',
		).length;
		const healthy = connected && this.state === 'ready' && recentFailures < 3; // Allow some failures

		return {
			healthy,
			connected,
			successfulOperations,
			failedOperations,
			uptime,
			lastCheck: now,
		};
	}

	/**
	 * Get maximum reconnection attempts (per SC-010)
	 */
	get maxReconnectAttempts(): number {
		return 3;
	}

	/**
	 * Attempt reconnection
	 *
	 * @returns Whether reconnection should be attempted
	 */
	shouldReconnect(): boolean {
		return this.reconnectAttempts < this.maxReconnectAttempts;
	}

	/**
	 * Record a reconnection attempt
	 */
	recordReconnectAttempt(): void {
		this.reconnectAttempts++;
	}

	/**
	 * Reset reconnection attempts counter
	 */
	resetReconnectAttempts(): void {
		this.reconnectAttempts = 0;
	}

	/**
	 * Get current reconnection attempt count
	 */
	getReconnectAttempts(): number {
		return this.reconnectAttempts;
	}

	/**
	 * Store available tools
	 *
	 * @param tools - Tools available on the server
	 */
	setAvailableTools(tools: Tool[]): void {
		this.availableTools = [...tools];
	}

	/**
	 * Get available tools
	 */
	getAvailableTools(): readonly Tool[] {
		return [...this.availableTools];
	}

	/**
	 * Get average operation duration
	 *
	 * @returns Average duration in milliseconds, or undefined if no completed operations
	 */
	getAverageOperationDuration(): number | undefined {
		const completed = this.operations.filter(
			op => op.status !== 'pending' && op.duration !== undefined,
		);

		if (completed.length === 0) {
			return undefined;
		}

		const totalDuration = completed.reduce(
			(sum, op) => sum + (op.duration ?? 0),
			0,
		);
		return totalDuration / completed.length;
	}

	/**
	 * Check for performance degradation (SC-008)
	 *
	 * Performance is considered degraded if average operation duration
	 * increases by more than 50% over the session
	 *
	 * @returns Whether performance has degraded
	 */
	hasPerformanceDegraded(): boolean {
		if (this.operations.length < 10) {
			return false; // Need sufficient data
		}

		// Compare first 10 operations vs last 10 operations
		const firstTen = this.operations
			.slice(0, 10)
			.filter(op => op.status !== 'pending' && op.duration !== undefined);
		const lastTen = this.operations
			.slice(-10)
			.filter(op => op.status !== 'pending' && op.duration !== undefined);

		if (firstTen.length < 5 || lastTen.length < 5) {
			return false; // Insufficient data
		}

		const firstAvg =
			firstTen.reduce((sum, op) => sum + (op.duration ?? 0), 0) /
			firstTen.length;
		const lastAvg =
			lastTen.reduce((sum, op) => sum + (op.duration ?? 0), 0) / lastTen.length;

		// Degraded if last 10 are 50% slower than first 10
		return lastAvg > firstAvg * 1.5;
	}
}
