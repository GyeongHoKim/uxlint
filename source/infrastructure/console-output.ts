/**
 * The only module permitted to write to stdout.
 *
 * `CLAUDE.md` reserves stdout and stderr for MCP protocol messages: JSON-RPC
 * shares the stream while a transport is open, so a stray write corrupts the
 * protocol. Everything that reads as logging goes to the Winston file logger.
 *
 * The exception this module exists for: **a terminating message written when
 * no MCP transport exists** — before one is created, or after it is closed. At
 * those moments the stream has no other writer.
 *
 * It exists at all because the log file is not reachable in CI. A pipeline
 * that fails must say why in the CI log; the log file lives in a container
 * that is discarded, and nothing uploads it.
 *
 * Not covered by the exception: anything written while analysis is running,
 * progress or status messages, and the report body.
 *
 * `xo.config.js` blocks `console` and `process.stdout`/`process.stderr`
 * everywhere under `source/` except this file.
 *
 * @packageDocumentation
 */

import process from 'node:process';

/**
 * Write a terminating message to stdout.
 *
 * Callers must be certain no MCP transport is open.
 *
 * @param message - Text to print; a trailing newline is added
 */
export function writeTerminalMessage(message: string): void {
	process.stdout.write(`${message}\n`);
}
