/**
 * The only module in this codebase permitted to write to stdout.
 *
 * `CLAUDE.md` reserves stdout and stderr for MCP protocol messages, and that
 * rule is real: JSON-RPC shares the stream while the transport is open, so a
 * stray write corrupts the protocol. Everything that looks like logging must
 * go to the Winston file logger instead.
 *
 * There is one narrow class of exception, and it lives here so it can be
 * enforced rather than remembered: **a terminating message written when no
 * MCP transport exists** — either before one has been created, or after it
 * has been closed. At those moments the stream has no other writer and the
 * rule's premise does not hold.
 *
 * That exception exists because the log file is not reachable in CI. A
 * pipeline that fails must say why in the CI log, or the developer whose
 * build broke has nothing to go on: the log lives in a container that is
 * destroyed, and nothing uploads it.
 *
 * Still forbidden, and not made legal by this module:
 * - anything written while analysis is running (the transport is open)
 * - progress, status or waiting messages (those are logging)
 * - the report body (that is a file artifact)
 *
 * `xo.config.js` blocks `console` and `process.stdout`/`process.stderr`
 * everywhere under `source/` except this file, so the boundary is checked by
 * the linter instead of resting on discipline.
 *
 * @packageDocumentation
 */

import process from 'node:process';

/**
 * Write a terminating message to stdout.
 *
 * Callers must be certain no MCP transport is open. Today that means config
 * rejection (before the client is built) and the gate verdict (after
 * `close()`).
 *
 * @param message - Text to print; a trailing newline is added
 */
export function writeTerminalMessage(message: string): void {
	process.stdout.write(`${message}\n`);
}
