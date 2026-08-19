import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import {createMCPClient} from '@ai-sdk/mcp';
import {Experimental_StdioMCPTransport as StdioMCPTransport} from '@ai-sdk/mcp/mcp-stdio';

const DIR = path.dirname(new URL(import.meta.url).pathname);
const CHROME = '/home/gyeongho/workspace/uxlint/chrome/linux-152.0.7977.42/chrome-linux64/chrome';
const html = fs.readFileSync(path.join(DIR, 'fixture.html'));

const server = http.createServer((_req, res) => {
	res.writeHead(200, {'content-type': 'text/html'});
	res.end(html);
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const url = `http://127.0.0.1:${server.address().port}/`;
console.log('fixture at', url);

const transport = new StdioMCPTransport({
	command: 'node',
	args: [
		'/home/gyeongho/workspace/uxlint/node_modules/chrome-devtools-mcp/build/src/bin/chrome-devtools-mcp.js',
		'--headless', '--isolated',
		'--no-performance-crux', '--no-usage-statistics',
		'--executablePath', CHROME,
		'--chromeArg=--no-sandbox',
	],
	env: {...process.env},
	stderr: 'inherit',
});

const client = await createMCPClient({transport});
const record = [];

async function timed(name, args, opts) {
	const t0 = process.hrtime.bigint();
	let result, error;
	try {
		result = await client.callTool({name, arguments: args, options: opts});
	} catch (error_) {
		error = error_;
	}
	const ms = Number(process.hrtime.bigint() - t0) / 1e6;
	const text = result?.content?.filter(c => c.type === 'text').map(c => c.text).join('\n') ?? '';
	record.push({name, ms: Math.round(ms), bytes: Buffer.byteLength(text), isError: result?.isError ?? null, failed: Boolean(error), error: error?.message});
	console.log(`\n### ${name}  ${Math.round(ms)}ms  ${Buffer.byteLength(text)} bytes  isError=${result?.isError ?? 'n/a'}${error ? ' THREW: ' + error.message : ''}`);
	return {result, text};
}

const tools = await client.listTools();
console.log('server tool count:', tools.tools.length);

await timed('navigate_page', {url});
const snap = await timed('take_snapshot', {});
console.log('snapshot head:', snap.text.slice(0, 200).replace(/\n/g, ' | '));

const lh = await timed('lighthouse_audit', {mode: 'navigation', device: 'desktop'});
console.log('--- lighthouse text ---');
console.log(lh.text);

const lhSnap = await timed('lighthouse_audit', {mode: 'snapshot', device: 'desktop'});
console.log('--- lighthouse snapshot-mode text (first 600) ---');
console.log(lhSnap.text.slice(0, 600));

const tr = await timed('performance_start_trace', {reload: true, autoStop: true});
console.log('--- trace text (first 1200) ---');
console.log(tr.text.slice(0, 1200));

fs.writeFileSync(path.join(DIR, 'timings.json'), JSON.stringify(record, null, 2));
fs.writeFileSync(path.join(DIR, 'lighthouse-out.txt'), lh.text);
fs.writeFileSync(path.join(DIR, 'trace-out.txt'), tr.text);

await client.close();
server.close();
console.log('\nDONE');
