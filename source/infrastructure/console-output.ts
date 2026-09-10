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

/**
 * Write a command's structured payload to stdout.
 *
 * The third role stdout has in this project, and the reason this is a second
 * named function rather than a widening of the one above. The agent-driven
 * route's `capture` and `evidence` are called *by a program*, which parses this
 * stream: their payload is the command's entire output, not a terminating
 * message about it.
 *
 * The exception's condition still holds and is what makes this safe — both
 * callers print only after the browser transport is closed, so nothing else owns
 * the stream at that moment. What does not hold is the *description*, and
 * stretching one writer to cover both would blur the rule
 * `tests/delegate/stdout-discipline.spec.ts` enforces against the judgement
 * server, where stdout genuinely carries JSON-RPC.
 *
 * Two narrow writers in one module keep the `xo` ban and that test intact. One
 * vague writer would not.
 *
 * @param payload - The value to serialise; printed as JSON with a trailing newline
 */
export function writeStructuredOutput(payload: unknown): void {
	process.stdout.write(`${JSON.stringify(payload, undefined, '\t')}\n`);
}
