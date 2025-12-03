import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import fs from 'node:fs';
import winston from 'winston';
import DailyRotateFile from 'winston-daily-rotate-file';

// Type definitions for fs dependency injection
type FsSyncMethods = Pick<typeof fs, 'existsSync' | 'mkdirSync'>;

/**
 * Logger type for dependency injection
 * IMPORTANT: All implementations ONLY write to files, never to stdout/stderr
 * because stdout is reserved for MCP protocol communication.
 */
export type ILogger = {
	debug(message: string, meta?: Record<string, unknown>): void;
	info(message: string, meta?: Record<string, unknown>): void;
	warn(message: string, meta?: Record<string, unknown>): void;
	error(message: string, meta?: Record<string, unknown>): void;
};

/**
 * Winston-based logger implementation with daily rotation
 */
export class WinstonLogger implements ILogger {
	private readonly logger: winston.Logger;

	constructor(
		logDirectory: string,
		enableDebug = false,
		private readonly fsSync: FsSyncMethods = fs,
	) {
		const {existsSync, mkdirSync} = this.fsSync;

		// Ensure log directory exists
		if (!existsSync(logDirectory)) {
			mkdirSync(logDirectory, {recursive: true});
		}

		const logFilePath = path.join(logDirectory, 'uxlint-%DATE%.log');

		this.logger = winston.createLogger({
			// Set log level: 'debug' if debug enabled, otherwise 'info'
			level: enableDebug ? 'debug' : 'info',
			format: winston.format.combine(
				winston.format.timestamp({format: 'YYYY-MM-DD HH:mm:ss'}),
				winston.format.errors({stack: true}),
				winston.format.json(),
			),
			transports: [
				new DailyRotateFile({
					filename: logFilePath,
					datePattern: 'YYYY-MM-DD',
					maxSize: '10m', // 10MB per file
					maxFiles: '14d', // Keep logs for 14 days
					zippedArchive: true,
				}) as winston.transport,
			],
			// Explicitly disable console/stdout output to prevent MCP protocol interference
			silent: false,
		});
	}

	debug(message: string, meta?: Record<string, unknown>): void {
		this.logger.debug(message, meta);
	}

	info(message: string, meta?: Record<string, unknown>): void {
		this.logger.info(message, meta);
	}

	warn(message: string, meta?: Record<string, unknown>): void {
		this.logger.warn(message, meta);
	}

	error(message: string, meta?: Record<string, unknown>): void {
		this.logger.error(message, meta);
	}
}

/**
 * Get cross-platform log directory path
 * - Windows: %LOCALAPPDATA%\uxlint\logs
 * - macOS: ~/Library/Logs/uxlint
 * - Linux: ~/.local/state/uxlint
 */
function getLogDirectory(): string {
	const platform = os.platform();
	const homeDir = os.homedir();

	if (platform === 'win32') {
		return path.join(
			process.env['LOCALAPPDATA'] ?? path.join(homeDir, 'AppData', 'Local'),
			'uxlint',
			'logs',
		);
	}

	if (platform === 'darwin') {
		return path.join(homeDir, 'Library', 'Logs', 'uxlint');
	}

	// Linux and other Unix-like systems (linux, freebsd, openbsd, sunos, aix, android, haiku, cygwin, netbsd)
	return path.join(
		process.env['XDG_STATE_HOME'] ?? path.join(homeDir, '.local', 'state'),
		'uxlint',
	);
}

/**
 * Singleton logger instance
 * IMPORTANT: This logger ONLY writes to files, never to stdout/stderr
 * because stdout is reserved for MCP protocol communication.
 *
 * Log level defaults to 'info' (logs info, warn, error only).
 */
export const logger: ILogger = new WinstonLogger(getLogDirectory(), false);

/**
 * Get log file path for user reference
 */
export function getLogFilePath(): string {
	const logDir = getLogDirectory();
	const today = new Date().toISOString().split('T')[0];
	return path.join(logDir, `uxlint-${today}.log`);
}
