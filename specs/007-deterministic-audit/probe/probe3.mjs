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


const html = fs.readFileSync(path.join(DIR, 'fixture.html'));
const server = http.createServer((_q, res) => {res.writeHead(200, {'content-type': 'text/html'}); res.end(html);});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const url = `http://127.0.0.1:${server.address().port}/`;

const client = await createMCPClient({transport: new StdioMCPTransport({
	command: 'node',
	args: [SERVER,
		'--headless', '--isolated', '--no-performance-crux', '--no-usage-statistics',
		'--executablePath', CHROME, '--chromeArg=--no-sandbox'],
	env: {...process.env}, stderr: 'ignore',
})});

await client.callTool({name: 'navigate_page', arguments: {url}});
const r = await client.callTool({name: 'lighthouse_audit', arguments: {mode: 'navigation'}});
console.log('top-level keys:', Object.keys(r).join(', '));
console.log('structuredContent present:', Boolean(r.structuredContent));
if (r.structuredContent) {
	console.log(JSON.stringify(r.structuredContent, null, 1).slice(0, 900));
}
// second audit on same page: are report paths stable or new each time?
const r2 = await client.callTool({name: 'lighthouse_audit', arguments: {mode: 'navigation'}});
const paths = s => (s.content ?? []).filter(c => c.type === 'text').map(c => c.text).join('\n').split('\n').filter(l => l.startsWith('- /'));
console.log('run1 paths:', paths(r));
console.log('run2 paths:', paths(r2));
// determinism of the violation set across two runs
const read = p => {const lhr = JSON.parse(fs.readFileSync(p.replace('- ', '').trim(), 'utf8'));
  return lhr.categories.accessibility.auditRefs.map(x => lhr.audits[x.id]).filter(a => a.score !== null && a.score < 1)
    .map(a => `${a.id}:${a.details?.debugData?.impact}:${a.details?.items?.length ?? 0}`).sort();};
const j1 = paths(r).find(p => p.endsWith('.json'));
const j2 = paths(r2).find(p => p.endsWith('.json'));
console.log('run1 violations:', JSON.stringify(read(j1)));
console.log('run2 violations:', JSON.stringify(read(j2)));
console.log('identical:', JSON.stringify(read(j1)) === JSON.stringify(read(j2)));
await client.close(); server.close();
