/**
 * Manual mock for @modelcontextprotocol/sdk/client/stdio.js
 */

const {EventEmitter} = require('node:events');
const {Readable, Writable} = require('node:stream');

const StdioClientTransport = jest.fn().mockImplementation(() => {
	// Create mock streams that don't connect to real processes
	const mockStdin = new Writable({
		write(chunk, encoding, callback) {
			// Immediately call callback to avoid hanging
			setImmediate(callback);
		},
	});

	const mockStdout = new Readable({
		read() {
			// No-op
		},
	});

	const mockStderr = new Readable({
		read() {
			// No-op
		},
	});

	// Set streams to non-blocking mode
	mockStdin.setDefaultEncoding('utf8');
	mockStdout.setEncoding('utf8');
	mockStderr.setEncoding('utf8');

	// Create mock child process
	const mockProcess = Object.assign(new EventEmitter(), {
		stdin: mockStdin,
		stdout: mockStdout,
		stderr: mockStderr,
		pid: 12345,
		killed: false,
		exitCode: null,
		kill: jest.fn().mockImplementation(() => {
			mockProcess.killed = true;
			mockProcess.exitCode = 0;
			// Emit exit event asynchronously
			setImmediate(() => {
				mockProcess.emit('exit', 0, null);
			});
			return true;
		}),
		on: jest.fn(),
		once: jest.fn(),
		removeListener: jest.fn(),
		removeAllListeners: jest.fn(),
	});

	return {
		start: jest.fn().mockResolvedValue(undefined),
		close: jest.fn().mockImplementation(async () => {
			// Simulate graceful process termination
			if (mockProcess.kill && !mockProcess.killed) {
				mockProcess.kill();
			}

			// Properly close streams
			return new Promise(resolve => {
				setImmediate(() => {
					mockStdin.end();
					mockStdout.destroy();
					mockStderr.destroy();
					mockProcess.removeAllListeners();
					resolve();
				});
			});
		}),
		send: jest.fn().mockResolvedValue(undefined),
		onmessage: null,
		onerror: null,
		onclose: null,
		process: mockProcess,
	};
});

module.exports = {StdioClientTransport, __esModule: true};
