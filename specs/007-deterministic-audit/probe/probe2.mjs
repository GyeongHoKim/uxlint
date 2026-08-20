import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import {createMCPClient} from '@ai-sdk/mcp';
import {Experimental_StdioMCPTransport as StdioMCPTransport} from '@ai-sdk/mcp/mcp-stdio';

import {createRequire} from 'node:module';
import process from 'node:process';

const require = createRequire(import.meta.url);

/**
 * The pinned server's entry point, resolved from the installed package rather
 * than from a path on one machine.
 */
const SERVER = require.resolve('chrome-devtools-mcp/package.json').replace(
	/package\.json$/,
	require('chrome-devtools-mcp/package.json').bin['chrome-devtools-mcp'].replace(/^\.\//, ''),
);

/**
 * Chrome to drive. Set UXLINT_CHROME to point at your own; the default is the
 * copy `npx @puppeteer/browsers install chrome@stable` leaves in the repo.
 */
const CHROME =
	process.env['UXLINT_CHROME'] ??
	path.resolve('chrome/linux-152.0.7977.42/chrome-linux64/chrome');

const DIR = path.dirname(new URL(import.meta.url).pathname);


const html = fs.readFileSync(path.join(DIR, 'fixture2.html'));

const server = http.createServer(async (req, res) => {
	if (req.url === '/slow.js') {
		await new Promise(r => setTimeout(r, 400));
		res.writeHead(200, {'content-type': 'application/javascript'});
		res.end('document.querySelector("h1").textContent="Checkout ready";');
		return;
	}
	res.writeHead(200, {'content-type': 'text/html'});
	res.end(html);
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const url = `http://127.0.0.1:${server.address().port}/`;

const client = await createMCPClient({transport: new StdioMCPTransport({
	command: 'node',
	args: [SERVER,
		'--headless', '--isolated', '--no-performance-crux', '--no-usage-statistics',
		'--executablePath', CHROME, '--chromeArg=--no-sandbox'],
	env: {...process.env}, stderr: 'ignore',
})});

async function call(name, args, options) {
	const t0 = process.hrtime.bigint();
	const r = await client.callTool({name, arguments: args, options});
	const ms = Math.round(Number(process.hrtime.bigint() - t0) / 1e6);
	const text = r.content.filter(c => c.type === 'text').map(c => c.text).join('\n');
	return {ms, text, isError: r.isError, bytes: Buffer.byteLength(text)};
}

await call('navigate_page', {url});
const t = await call('performance_start_trace', {reload: true, autoStop: true});
console.log(`trace: ${t.ms}ms  ${t.bytes} bytes  isError=${t.isError}`);
const metrics = t.text.split('\n').filter(l => /Metrics|LCP|CLS|FCP|INP|insight set id|Available insights|^  - /.test(l));
console.log('--- metric lines ---');
console.log(metrics.join('\n'));

// Timeout behaviour probe (FR-005a)
console.log('\n--- abort probe ---');
try {
	const r = await call('lighthouse_audit', {mode: 'navigation'}, {signal: AbortSignal.timeout(300)});
	console.log('completed unexpectedly', r.ms, r.isError);
} catch (error) {
	console.log('threw:', error.constructor.name, '|', String(error.message).slice(0, 120));
}

// Does the server still work after an aborted call?
const after = await call('take_snapshot', {});
console.log('after abort, take_snapshot isError =', after.isError, `(${after.ms}ms)`);

fs.writeFileSync(path.join(DIR, 'trace2-out.txt'), t.text);
await client.close();
server.close();
console.log('DONE');
